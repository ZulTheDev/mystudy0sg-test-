import { portalAllowed, portalCors, portalJson } from '../_shared/cors.ts';
// Only Fore Directors approve or reject candidate minutes. Reviewers cannot approve themselves.
// Database RPC verifies current department grants and writes a single award atomically.

import { admin, authenticate, hasRole } from '../_shared/portal-auth.ts';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function respond(req: Request, body:unknown,status=200): Response { return portalJson(req,body,status); }

Deno.serve(async (request: Request) => {
  if (!portalAllowed(request)) return respond(request, { error: 'Forbidden' }, 403);
  if (request.method === 'OPTIONS') return respond(request, {}, 204);
  if (request.method !== 'POST') return respond(request, { error: 'Method not allowed' }, 405);

  try {
    const actor = await authenticate(request);
    const payload = await request.json();
    if (typeof payload?.claim_id !== 'string' || !uuid.test(payload.claim_id) ||
        !['approve', 'reject'].includes(payload?.decision) ||
        typeof payload?.reason !== 'string' || payload.reason.trim().length < 4 ||
        typeof payload?.idempotency_key !== 'string' || payload.idempotency_key.length < 10 ||
        (payload.decision === 'approve' &&
          (!Number.isInteger(payload.minutes) || payload.minutes < 1 || payload.minutes > 480))) {
      return respond(request, { error: 'Invalid review request' }, 400);
    }

    // Narrow the reviewer to the specific claim's department.
    const { data: claim, error: claimError } = await admin.from('service_claims')
      .select('organizer_id,department').eq('id', payload.claim_id).single();
    if (claimError || !claim) return respond(request, { error: 'Claim not found' }, 404);
    if (claim.organizer_id === actor.id ||
        !hasRole(actor, 'fore_director')) {
      return respond(request, { error: 'You cannot review this claim' }, 403);
    }

    // One transaction performs review and (if approved) appends a ledger entry.
    const { data, error } = await admin.rpc('review_service_claim', {
      p_claim_id: payload.claim_id,
      p_reviewer_id: actor.id,
      p_decision: payload.decision,
      p_minutes: payload.decision === 'approve' ? payload.minutes : null,
      p_reason: payload.reason.trim(),
      p_idempotency_key: payload.idempotency_key,
      p_potential_via: payload.decision === 'approve' && payload.potential_via === true,
    });
    if (error) return respond(request, { error: 'Review rejected; check status, rights or overlapping time' }, 409);
    return respond(request, { decision: payload.decision, ledger_entry_id: data ?? null });
  } catch (_error) {
    return respond(request, { error: 'Access denied or temporarily unavailable' }, 401);
  }
});
