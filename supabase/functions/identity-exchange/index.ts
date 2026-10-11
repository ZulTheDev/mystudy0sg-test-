// Study0SG: Exchange a verified Stytch B2B session for a short Supabase JWT.
// This is a backend Edge Function. No secret from this file belongs in the SPA.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { importJWK, SignJWT, type JWK } from 'npm:jose@5';

const env = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing server configuration: ${key}`);
  return value;
};

// Fail closed if any Stytch Test identity setting is used in a production deployment.
// Staging remains unchanged until PORTAL_ENVIRONMENT is set to 'production'.
if (Deno.env.get('PORTAL_ENVIRONMENT') === 'production') {
  if (env('STYTCH_API_BASE') !== 'https://api.stytch.com' ||
      !env('STYTCH_PROJECT_ID').startsWith('project-live-') ||
      !env('STYTCH_ORGANIZATION_ID').startsWith('organization-live-')) {
    throw new Error('Production Stytch configuration must use Live project, API and organization');
  }
}

// Exact browser-origin allowlist. An Origin never includes the GitHub Pages path.
// PORTAL_ORIGIN is shared with other portal functions; extra allowed origins are
// optional and must be configured explicitly on the trusted Edge Function server.
const siteOrigin = env('PORTAL_ORIGIN');
const extraOrigins = (Deno.env.get('PORTAL_ALLOWED_ORIGINS') ?? '')
  .split(',').map((value) => value.trim()).filter(Boolean);
const allowedOrigins = new Set([siteOrigin, ...extraOrigins]);
const supabaseURL = env('SUPABASE_URL');
const admin = createClient(supabaseURL, env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Reflect only an explicitly allowlisted Origin, never an arbitrary browser origin.
function response(req: Request, body: unknown, status = 200): Response {
  const origin = req.headers.get('Origin') ?? '';
  const corsHeaders: Record<string, string> = allowedOrigins.has(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      }
    : {};
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
      ...corsHeaders,
    },
  });
}

// Avoid saving the provider's identity subject or email as an identity key.
async function subjectDigest(provider: string, subject: string): Promise<string> {
  const rawKey = new TextEncoder().encode(env('PORTAL_IDENTITY_PEPPER'));
  const hmacKey = await crypto.subtle.importKey(
    'raw', rawKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const payload = new TextEncoder().encode(`${provider}:${subject}`);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, payload));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

type Factor = { type?: string; delivery_method?: string };
type SessionResponse = {
  member_session?: {
    member_id?: string;
    member_session_id?: string;
    organization_id?: string;
    authentication_factors?: Factor[];
    expires_at?: string;
  };
};

// Authenticate against Stytch's backend endpoint on every exchange.
async function verifyStytch(stytchJWT: string): Promise<SessionResponse | null> {
  const projectID = env('STYTCH_PROJECT_ID');
  const secret = env('STYTCH_SECRET');
  const base = env('STYTCH_API_BASE'); // https://test.stytch.com or https://api.stytch.com
  const result = await fetch(`${base}/v1/b2b/sessions/authenticate`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${projectID}:${secret}`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_jwt: stytchJWT }),
    signal: AbortSignal.timeout(5000),
  });
  if (!result.ok) return null;
  return (await result.json()) as SessionResponse;
}

// Only issue a token for a live, approved, identity-linked organizer.
Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    if (!allowedOrigins.has(req.headers.get('Origin') ?? '')) return response(req, { error: 'Forbidden' }, 403);
    return response(req, {}, 204);
  }
  if (req.method !== 'POST' || !allowedOrigins.has(req.headers.get('Origin') ?? '')) {
    return response(req, { error: 'Forbidden' }, 403);
  }

  let diagnosticStage = 'request_validation';
  try {
    if (Number(req.headers.get('content-length') || 0) > 16_384) {
      return response(req, { error: 'Invalid request' }, 413);
    }
    const input = await req.json() as { stytch_session_jwt?: unknown };
    if (typeof input.stytch_session_jwt !== 'string' ||
        input.stytch_session_jwt.length < 20 ||
        input.stytch_session_jwt.length > 10_000) {
      return response(req, { error: 'Invalid request' }, 400);
    }

    diagnosticStage = 'stytch_session_verification';
    const verified = await verifyStytch(input.stytch_session_jwt);
    const session = verified?.member_session;
    if (!session?.member_id || !session?.member_session_id ||
        session.organization_id !== env('STYTCH_ORGANIZATION_ID') ||
        !session.expires_at || Date.parse(session.expires_at) <= Date.now()) {
      return response(req, { error: 'Session not authorised' }, 401);
    }

    diagnosticStage = 'identity_digest';
    const digest = await subjectDigest(
      'stytch', `${session.organization_id}:${session.member_id}`,
    );
    diagnosticStage = 'identity_link_lookup';
    const { data: link, error: linkError } = await admin
      .from('identity_links')
      .select('organizer_id')
      .eq('provider', 'stytch')
      .eq('subject_digest', digest)
      .maybeSingle();
    if (linkError || !link) return response(req, { error: 'Not enrolled' }, 403);

    diagnosticStage = 'organizer_lookup';
    const { data: organizer, error: organizerError } = await admin
      .from('organizers')
      .select('id,status,lock_reason,session_epoch')
      .eq('id', link.organizer_id)
      .single();
    if (organizerError || !organizer || organizer.status !== 'active' ||
        organizer.lock_reason !== null) {
      return response(req, { error: 'Access requires review' }, 403);
    }

    diagnosticStage = 'role_grants_lookup';
    const { data: grants, error: grantsError } = await admin
      .from('organizer_grants')
      .select('role,department')
      .eq('organizer_id', organizer.id)
      .is('revoked_at', null);
    if (grantsError || !grants?.length) return response(req, { error: 'No active assignment' }, 403);

    // For high-trust accounts require at least two independently verified factors.
    // Review Stytch's exact WebAuthn/user-verification semantics before allowing
    // a passkey by itself to satisfy this policy.
    const elevated = grants.some((g) =>
      ['fore_director', 'director', 'tech_security'].includes(g.role));
    const factors = session.authentication_factors ?? [];
    const verifiedMfa = factors.some((f) => f.type === 'totp') &&
      factors.some((f) => f.type !== 'totp');
    if (elevated && !verifiedMfa) {
      return response(req, { error: 'Additional verification required' }, 403);
    }

    diagnosticStage = 'jwt_key_loading';

    // Identify only the key-format problem. Never log the key or its values.
    const rawJwk = Deno.env.get('PORTAL_JWT_PRIVATE_JWK');
    if (!rawJwk?.trim()) {
      console.error('[identity-exchange] JWT key check: secret_missing');
      throw new Error('JWT key configuration unavailable');
    }
    let signingJWK: JWK;
    try {
      signingJWK = JSON.parse(rawJwk) as JWK;
    } catch {
      console.error('[identity-exchange] JWT key check: invalid_json');
      throw new Error('JWT key configuration unavailable');
    }
    if (typeof signingJWK === 'string') {
      console.error('[identity-exchange] JWT key check: double_encoded_json');
      throw new Error('JWT key configuration unavailable');
    }
    if (!signingJWK || typeof signingJWK !== 'object' || Array.isArray(signingJWK)) {
      console.error('[identity-exchange] JWT key check: not_a_jwk_object');
      throw new Error('JWT key configuration unavailable');
    }
    if (signingJWK.kty !== 'EC' || signingJWK.crv !== 'P-256') {
      console.error('[identity-exchange] JWT key check: wrong_key_type_or_curve');
      throw new Error('JWT key configuration unavailable');
    }
    if (typeof signingJWK.kid !== 'string' || !signingJWK.kid) {
      console.error('[identity-exchange] JWT key check: missing_kid');
      throw new Error('JWT key configuration unavailable');
    }
    if (typeof signingJWK.x !== 'string' || typeof signingJWK.y !== 'string') {
      console.error('[identity-exchange] JWT key check: missing_public_coordinates');
      throw new Error('JWT key configuration unavailable');
    }
    if (typeof signingJWK.d !== 'string') {
      console.error('[identity-exchange] JWT key check: missing_private_component');
      throw new Error('JWT key configuration unavailable');
    }
    // Import only required P-256 signing material. Extra JWK metadata such as
    // key_ops/use/ext is not needed for signing and may be rejected by runtimes.
    // Keep the original kid separately for the signed token header.
    const privateSigningJWK: JWK = {
      kty: 'EC',
      crv: 'P-256',
      x: signingJWK.x,
      y: signingJWK.y,
      d: signingJWK.d,
    };

    let key: Awaited<ReturnType<typeof importJWK>>;
    try {
      key = await importJWK(privateSigningJWK, 'ES256');
    } catch (error) {
      // Log only an error class, never key material or the raw exception.
      const safeNames = new Set([
        'DataError', 'TypeError', 'SyntaxError', 'NotSupportedError',
        'InvalidAccessError', 'OperationError',
      ]);
      const name = error instanceof Error && safeNames.has(error.name)
        ? error.name : 'OtherError';
      console.error(`[identity-exchange] JWT key check: import_rejected (${name})`);
      throw new Error('JWT key configuration unavailable');
    }
    if (!('type' in key) || key.type !== 'private') {
      console.error('[identity-exchange] JWT key check: not_a_private_key');
      throw new Error('JWT key configuration unavailable');
    }
    const now = Math.floor(Date.now() / 1000);

    // 'authenticated' is the Supabase transport role, not a Study0SG team role.
    diagnosticStage = 'jwt_signing';
    const jwt = await new SignJWT({
      role: 'authenticated',
      portal_v: 1,
      ep: organizer.session_epoch,
      aal: elevated ? 'aal2' : 'aal1',
      sid: await subjectDigest('session', session.member_session_id),
    })
      .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: signingJWK.kid })
      .setSubject(organizer.id)
      .setIssuer(env('PORTAL_ISSUER'))
      .setAudience('authenticated')
      .setIssuedAt(now)
      .setNotBefore(now)
      .setExpirationTime(now + 300)
      .setJti(crypto.randomUUID())
      .sign(key);

    return response(req, {
      access_token: jwt, token_type: 'Bearer', expires_in: 300,
      organizer: { id: organizer.id, roles: grants.map(g => g.role), grants },
    });
  } catch (_error) {
    // Log only the failing step, never secrets, tokens, error objects, or user data.
    console.error(`[identity-exchange] Failed stage: ${diagnosticStage}`);
    return response(req, { error: 'Authentication temporarily unavailable' }, 503);
  }
});
