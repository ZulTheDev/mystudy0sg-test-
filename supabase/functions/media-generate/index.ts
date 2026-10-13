import {portalAllowed, portalJson} from '../_shared/cors.ts';
// Study0SG media concept art through fal.ai: preview-only, role verified, atomic daily quota.
// Generated URLs are temporary external assets; save an approved image to R2 separately.
import { authenticate, admin } from '../_shared/portal-auth.ts';

const get = (k: string) => Deno.env.get(k)?.trim() || '';
function reply(req: Request, body: unknown, status = 200) {
  return portalJson(req, body, status);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    if (!portalAllowed(req)) return reply(req, { error: 'Forbidden' }, 403);
    return reply(req, {}, 204);
  }
  if (req.method !== 'POST' || !portalAllowed(req)) return reply(req, { error: 'Forbidden' }, 403);
  try {
    const actor = await authenticate(req);
    const allowed = actor.grants.some(g => g.role === 'fore_director' ||
      ((g.role === 'director' || g.role === 'media_crew') && g.department === 'media'));
    if (!allowed) return reply(req, { error: 'Media team access required' }, 403);
    if (Number(req.headers.get('content-length') || 0) > 5000) return reply(req, { error: 'Request too large' }, 413);
    const body = await req.json() as { prompt?: unknown; shape?: unknown };
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const shape = body.shape === 'portrait_4_3' ? 'portrait_4_3' :
      body.shape === 'landscape_4_3' ? 'landscape_4_3' : 'square';
    if (prompt.length < 10 || prompt.length > 450) return reply(req, { error: 'Describe the illustration in 10–450 characters.' }, 400);
    // Don't transmit contact identifiers or registration details to an image service.
    if (/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b|\b\+?65[\s-]?[689]\d{3}[\s-]?\d{4}\b/.test(prompt))
      return reply(req, { error: 'Remove personal contact information before generating media.' }, 400);
    const falKey = get('FAL_KEY');
    if (!falKey) return reply(req, { error: 'FAL_KEY is not configured on the backend.' }, 503);
    // Only the backend service-role key can reserve quota; browser cannot bypass billing limits.
    const { data: remaining, error: quotaError } = await admin.rpc('media_ai_reserve', { p_organizer: actor.id });
    if (quotaError) return reply(req, { error: 'Daily AI image limit reached, or the budget migration is not installed.' }, 429);
    const result = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method: 'POST',
      headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `Simple background illustration for Study0SG educational publicity. No letters or text. ${prompt}`, image_size: shape, num_images: 1, num_inference_steps: 4, enable_safety_checker: true, output_format: 'jpeg' }),
      signal: AbortSignal.timeout(45000),
    });
    if (!result.ok) throw new Error('fal_request_failed');
    const data = await result.json() as { images?: Array<{ url?: string; width?: number; height?: number }> };
    const image = data.images?.[0];
    if (!image?.url) throw new Error('fal_empty');
    const imageUrl = new URL(image.url);
    if (imageUrl.protocol !== 'https:' || !(imageUrl.hostname === 'fal.media' || imageUrl.hostname.endsWith('.fal.media')))
      throw new Error('unexpected_media_host');
    return reply(req, { image_url: imageUrl.href, width: image.width, height: image.height, remaining_today: remaining,
      notice: 'Preview only. Download and re-import your approved image; R2 publishing is a separate reviewed step.' });
  } catch (error) {
    console.error('[media-generate] generation failed', error instanceof Error ? error.name : 'Error');
    return reply(req, { error: 'Image generation unavailable. Check fal.ai billing, usage limits and Edge Function logs.' }, 503);
  }
});
