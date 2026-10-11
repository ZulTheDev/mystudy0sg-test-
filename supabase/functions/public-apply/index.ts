// Anonymous, write-only volunteer application endpoint.
// Requires Turnstile proof and verified email before any approval.

import { admin } from '../_shared/portal-auth.ts';

const origin = Deno.env.get('PORTAL_ORIGIN')!;
const departments = new Set([
  'support','community','media','technology','education','executive',
]);

function answer(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':'application/json','Cache-Control':'no-store',
      'Access-Control-Allow-Origin':origin,'Vary':'Origin',
      'Access-Control-Allow-Headers':'content-type,apikey',
      'Access-Control-Allow-Methods':'POST, OPTIONS',
    },
  });
}

Deno.serve(async (req) => {
  if (req.headers.get('Origin') !== origin) return answer({error:'Forbidden'},403);
  if (req.method === 'OPTIONS') return answer({},204);
  if (req.method !== 'POST') return answer({error:'Method not allowed'},405);
  try {
    const body = await req.text();
    if (body.length > 8192) return answer({error:'Request too large'},413);
    const x = JSON.parse(body);
    if (x.website) return answer({received:true},202); // Honeypot; do not store.
    const challenge = String(x.turnstile_token || '');
    if (!challenge || challenge.length > 3000) return answer({error:'Verification needed'},400);

    const verifyForm = new FormData();
    verifyForm.set('secret',Deno.env.get('TURNSTILE_SECRET')!);
    verifyForm.set('response',challenge);
    const verified = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method:'POST',body:verifyForm,signal:AbortSignal.timeout(5000),
    });
    if (!verified.ok) return answer({error:'Verification unavailable'},503);
    const result = await verified.json() as {success?: boolean; hostname?: string};
    if (!result.success || result.hostname !== Deno.env.get('PORTAL_HOSTNAME')) {
      return answer({error:'Verification failed'},403);
    }

    const name = String(x.display_name ?? '').trim();
    const email = String(x.email ?? '').trim().toLowerCase();
    const biography = String(x.biography ?? '').trim();
    const list = x.preferred_departments;
    if (name.length < 2 || name.length > 100 || biography.length < 50 ||
        biography.length > 500 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        !Array.isArray(list) || list.length < 1 || list.length > 3 ||
        !list.every((d: unknown) => typeof d === 'string' && departments.has(d)) ||
        new Set(list).size !== list.length ||
        x.consent_version !== 'volunteer-privacy-v1') {
      return answer({error:'Please review the application fields'},400);
    }
    const { data, error } = await admin.from('applications').insert({
      display_name:name,email,biography,preferred_departments:list,
      availability_hours_per_week:Number(x.availability_hours_per_week || 0),
      consent_version:'volunteer-privacy-v1',
      public_card_opt_in:x.public_card_opt_in === true,
      status:'pending', // email_verified_at remains NULL until signed link redeemed.
    }).select('receipt_code').single();
    if (error) return answer({error:'Application unavailable'},503);

    // Queue a separate signed email-link verification workflow here.
    // Production: use a worker with a single-use HMAC/hashed token in DB.
    return answer({received:true,receipt_code:data.receipt_code},202);
  } catch (_error) {
    return answer({error:'Could not accept application'},503);
  }
});
