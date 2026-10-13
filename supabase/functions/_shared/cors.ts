/** One exact origin allowlist for all browser-facing Supabase Edge Functions.
 * An origin is scheme + host + optional port (no trailing slash or path).
 * CORS does not authorize a user. Handlers must still validate identity and role.
 */
function configuredOrigins(): Set<string> {
  const sources = [Deno.env.get('PORTAL_ORIGIN') ?? '',
    ...(Deno.env.get('PORTAL_ALLOWED_ORIGINS') ?? '').split(',')];
  const exact = new Set<string>();
  for (const raw of sources) {
    const input = raw.trim();
    if (!input || input.includes('*')) continue;
    try {
      const url = new URL(input);
      if (!['https:', 'http:'].includes(url.protocol) ||
          (url.protocol === 'http:' && !['localhost','127.0.0.1'].includes(url.hostname)) ||
          url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
          input !== url.origin && input !== `${url.origin}/`) continue;
      exact.add(url.origin);
    } catch { /* Ignore broken settings instead of opening every origin. */ }
  }
  return exact;
}

export function portalAllowed(req: Request): boolean {
  const origin = req.headers.get('Origin');
  return Boolean(origin && configuredOrigins().has(origin));
}

export function portalCors(req: Request): Record<string,string> {
  const headers: Record<string,string> = {'Vary':'Origin', 'Cache-Control':'no-store'};
  if (!portalAllowed(req)) return headers;
  return {...headers,
    'Access-Control-Allow-Origin':req.headers.get('Origin')!,
    'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
    'Access-Control-Allow-Methods':'POST,OPTIONS',
    'Access-Control-Max-Age':'600',
  };
}

export function portalJson(req: Request, data:unknown, status=200): Response {
  return new Response(status===204?null:JSON.stringify(data),{status,headers:{
    'Content-Type':'application/json; charset=utf-8',...portalCors(req),
  }});
}
