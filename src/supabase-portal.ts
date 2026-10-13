// Public browser API. Import into the statically built SPA only.
// Only publishable project details go in build-time environment variables.

import { createClient } from '@supabase/supabase-js';

let currentPortalToken: string | null = null;
const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

// Fail early if browser configuration is missing or malformed.
if (!projectUrl || !/^https:\/\/[^/]+\.supabase\.co\/?$/.test(projectUrl)) {
  throw new Error('VITE_SUPABASE_URL is missing or invalid. Check .env.local and restart Vite.');
}
if (!publishableKey || !publishableKey.startsWith('sb_publishable_')) {
  throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be your Supabase publishable API key.');
}

const supabaseOrigin = new URL(projectUrl).origin;

// Guarantee the public API key reaches the Supabase REST gateway.
// Never forward this header to external websites or upload URLs.
const portalFetch: typeof fetch = (input, init) => {
  const requestUrl = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
    projectUrl,
  );

  if (requestUrl.origin !== supabaseOrigin || !requestUrl.pathname.startsWith('/rest/v1/')) {
    return fetch(input, init);
  }

  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  headers.set('apikey', publishableKey);

  // Preserve the Authorization header set by Supabase JS for the organizer JWT.
  return fetch(input, { ...init, headers });
};

// The portal JWT is supplied after a verified Stytch identity exchange.
// The publishable key is never a replacement for the organizer JWT.
export const db = createClient(projectUrl, publishableKey, {
  accessToken: async () => currentPortalToken,
  global: { fetch: portalFetch },
});

// Exchange provider-issued session credentials with a trusted Edge Function.
export type OrganizerAccess = {
  id: string;
  roles: string[];
  grants: Array<{ role: string; department: string | null }>;
};

// Exchange happens only after Stytch login. Roles come from trusted Supabase data.
export async function exchangeStytch(stytchSessionJWT: string): Promise<OrganizerAccess> {
  if (!projectUrl || !publishableKey) throw new Error('Supabase URL or publishable key is missing');
  const res = await fetch(`${projectUrl}/functions/v1/identity-exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publishableKey,
    },
    body: JSON.stringify({ stytch_session_jwt: stytchSessionJWT }),
  });
  if (!res.ok) {
    const reply = await res.json().catch(() => null) as { error?: string } | null;
    throw new Error(reply?.error || `Organizer access denied (HTTP ${res.status})`);
  }
  const data = await res.json() as { access_token: string; organizer: OrganizerAccess };
  currentPortalToken = data.access_token; // Intentionally memory-only.
  // Keep existing Realtime subscriptions authenticated when the short-lived JWT is renewed.
  void db.realtime.setAuth(data.access_token);
  return data.organizer;
}

// Call the database function, which blocks access before any external cleanup.
export async function submitResignation(reason?: string): Promise<string> {
  if (!currentPortalToken) throw new Error('Please sign in again');
  const { data, error } = await db.rpc('submit_resignation', {
    p_reason: reason || null,
  });
  if (error) throw error;
  currentPortalToken = null; // Session is denied by RLS even without this.
  return data as string;
}

// Signed object URLs must be used only for the intended key and content type.
export async function uploadToR2(file: File): Promise<void> {
  if (!currentPortalToken) throw new Error('Please sign in again');
  const reply = await fetch(`${projectUrl}/functions/v1/media-presign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publishableKey,
      Authorization: `Bearer ${currentPortalToken}`,
    },
    body: JSON.stringify({ mime_type: file.type, byte_size: file.size }),
  });
  if (!reply.ok) throw new Error('Upload not authorised');
  const signed = await reply.json() as { put_url: string };
  const uploaded = await fetch(signed.put_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!uploaded.ok) throw new Error('Upload failed');
  // Call /media-complete next so the backend verifies the object checksum,
  // scans it, updates the quarantine row and issues any review tasks.
}

// Clear memory state without trying to revoke IdP-managed sessions here.
export function clearPortalToken(): void { currentPortalToken = null; }
// Only use while an authenticated session is active; never persist this JWT.
export function getPortalToken(): string | null { return currentPortalToken; }
