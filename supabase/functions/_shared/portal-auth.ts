// Verify imported-key portal JWTs for every privileged Edge API request.
// Do not accept a browser-provided actor ID, role or department.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const issuer = Deno.env.get('PORTAL_ISSUER')!;

export const admin = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const trustedKeys = createRemoteJWKSet(
  new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`),
);

export type PortalActor = {
  id: string;
  session_epoch: number;
  grants: Array<{ role: string; department: string | null }>;
};

// Reject expired, forged, suspended, offboarded or locked sessions.
export async function authenticate(req: Request): Promise<PortalActor> {
  const raw = req.headers.get('Authorization') ?? '';
  if (!raw.startsWith('Bearer ')) throw new Error('Unauthenticated');
  const { payload } = await jwtVerify(raw.slice(7), trustedKeys, {
    issuer,
    audience: 'authenticated',
    algorithms: ['ES256'],
    maxTokenAge: '5 minutes',
  });
  if (payload.role !== 'authenticated' ||
      typeof payload.sub !== 'string' ||
      !/^[0-9a-f-]{36}$/i.test(payload.sub)) {
    throw new Error('Invalid portal identity');
  }

  const { data: user, error } = await admin
    .from('organizers')
    .select('id, status, lock_reason, session_epoch')
    .eq('id', payload.sub)
    .single();
  if (error || !user || user.status !== 'active' || user.lock_reason ||
      Number(payload.ep) !== user.session_epoch) {
    throw new Error('Organizer access was revoked');
  }

  const { data: grants, error: grantError } = await admin
    .from('organizer_grants')
    .select('role,department')
    .eq('organizer_id', user.id)
    .is('revoked_at', null);
  if (grantError || !grants?.length) throw new Error('No active grants');
  return { id: user.id, session_epoch: user.session_epoch, grants };
}

// Role checks belong on the API even when RLS separately protects the DB.
export function hasRole(actor: PortalActor, role: string, department?: string): boolean {
  return actor.grants.some((g) => g.role === 'fore_director' ||
    (g.role === role && (!department || g.department === department)));
}
