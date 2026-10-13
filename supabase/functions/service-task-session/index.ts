import { portalAllowed, portalCors, portalJson } from '../_shared/cors.ts';
// Start or finish an assigned task work session.
// The database uses its own clock, and completion creates a pending claim only.

import { admin, authenticate } from '../_shared/portal-auth.ts';

function respond(req: Request, body:unknown,status=200): Response { return portalJson(req,body,status); }

Deno.serve(async (request: Request) => {
  if (!portalAllowed(request)) return respond(request, { error: 'Forbidden' }, 403);
  if (request.method === 'OPTIONS') return respond(request, {}, 204);
  if (request.method !== 'POST') return respond(request, { error: 'Method not allowed' }, 405);

  try {
    const actor = await authenticate(request);
    const payload = await request.json();
    if (!payload || (payload.action !== 'start' && payload.action !== 'finish')) {
      return respond(request, { error: 'Choose start or finish' }, 400);
    }
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const providedId = payload.action === 'start' ? payload.task_id : payload.session_id;
    if (typeof providedId !== 'string' || !uuid.test(providedId)) {
      return respond(request, { error: 'Invalid task/session identifier' }, 400);
    }

    // Never take organizer_id or approved minutes from browser JSON.
    const { data, error } = await admin.rpc(
      payload.action === 'start' ? 'start_service_task_session' : 'finish_service_task_session',
      payload.action === 'start'
        ? { p_organizer_id: actor.id, p_task_id: providedId }
        : { p_organizer_id: actor.id, p_session_id: providedId },
    );
    if (error) return respond(request, { error: 'Cannot record session; check the task and try again' }, 409);
    return respond(request, payload.action === 'start'
      ? { session_id: data, state: 'active' }
      : { claim_id: data, state: 'pending_review' });
  } catch (_error) {
    return respond(request, { error: 'Access denied or temporarily unavailable' }, 401);
  }
});
