// Start or finish an assigned task work session.
// The database uses its own clock, and completion creates a pending claim only.

import { admin, authenticate } from '../_shared/portal-auth.ts';

const allowedOrigin = Deno.env.get('PORTAL_ORIGIN')!;
function respond(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Headers': 'authorization,apikey,content-type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Vary': 'Origin',
    },
  });
}

Deno.serve(async (request: Request) => {
  if (request.headers.get('Origin') !== allowedOrigin) return respond({ error: 'Forbidden' }, 403);
  if (request.method === 'OPTIONS') return respond({}, 204);
  if (request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405);

  try {
    const actor = await authenticate(request);
    const payload = await request.json();
    if (!payload || (payload.action !== 'start' && payload.action !== 'finish')) {
      return respond({ error: 'Choose start or finish' }, 400);
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const providedId = payload.action === 'start' ? payload.task_id : payload.session_id;
    if (typeof providedId !== 'string' || !uuid.test(providedId)) {
      return respond({ error: 'Invalid task/session identifier' }, 400);
    }

    // Never take organizer_id or approved minutes from browser JSON.
    const { data, error } = await admin.rpc(
      payload.action === 'start' ? 'start_service_task_session' : 'finish_service_task_session',
      payload.action === 'start'
        ? { p_organizer_id: actor.id, p_task_id: providedId }
        : { p_organizer_id: actor.id, p_session_id: providedId },
    );
    if (error) return respond({ error: 'Cannot record session; check the task and try again' }, 409);
    return respond(payload.action === 'start'
      ? { session_id: data, state: 'active' }
      : { claim_id: data, state: 'pending_review' });
  } catch (_error) {
    return respond({ error: 'Access denied or temporarily unavailable' }, 401);
  }
});
