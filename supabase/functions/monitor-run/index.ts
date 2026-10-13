import { portalAllowed, portalCors } from '../_shared/cors.ts';
// Study0SG controlled synthetic monitor.
// Probes ONLY approved service targets. No browser-provided URLs or packet bodies.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { S3Client, HeadBucketCommand } from 'npm:@aws-sdk/client-s3@3';
import { authenticate, hasRole } from '../_shared/portal-auth.ts';

type State = 'healthy' | 'degraded' | 'down' | 'unconfigured';
type Sample = { service_id: string; state: State; response_ms: number | null; http_status: number | null; note: string };
const serviceNames = [
  'organizer_portal','public_website','supabase_database',
  'stytch_identity','google_drive','cloudflare_r2',
] as const;

const env = (key: string) => Deno.env.get(key)?.trim() ?? '';
const notSet = (value:string) => !value || /^(OPTIONAL_|REPLACE|SET_ONLY|YOUR_|KEEP_EXISTING)/i.test(value) || /-REPLACE$/.test(value);
const adminKey = (() => {
  const raw = env('SUPABASE_SECRET_KEYS');
  if (raw) {
    const values = JSON.parse(raw) as Record<string,string>;
    return values.default;
  }
  return env('SUPABASE_SERVICE_ROLE_KEY');
})();
const admin = createClient(env('SUPABASE_URL'), adminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// All internal endpoints share the same reviewed origin allowlist.
const cors = (req:Request): Record<string,string> => portalCors(req);
const reply = (req:Request, body: unknown, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', ...cors(req) },
});

// Avoid logging or comparing secrets by prefix. Compare all bytes instead.
function equalTokens(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length,right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

// Only allow HTTPS hostnames listed by the deployer, without redirects.
function approvedWebURL(value: string): URL | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    const hosts = env('MONITOR_ALLOWED_HOSTS').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
    if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || u.port ||
        u.hostname.toLowerCase()==='localhost' || u.hostname.endsWith('.local') || u.hostname.endsWith('.internal') ||
        /^[0-9.]+$/.test(u.hostname) || u.hostname.includes(':') ||
        !hosts.includes(u.hostname.toLowerCase()) || !/^[a-z0-9.-]+$/i.test(u.hostname)) return null;
    return u;
  } catch { return null; }
}

function result(id: string, state: State, ms: number | null, http: number | null, note: string): Sample {
  return {service_id:id,state,response_ms:ms,http_status:http,note:note.slice(0,200)};
}

// Validate the static site's HTML and, for Vite, its compiled JS file.
async function checkWebsite(id: string, configName: string, checkScript: boolean): Promise<Sample> {
  const url = approvedWebURL(env(configName));
  if (!url) return result(id,'unconfigured',null,null,'No approved HTTPS target configured');
  const start = performance.now();
  try {
    const page = await fetch(url, { redirect:'manual', signal: AbortSignal.timeout(6500), headers:{'Accept':'text/html'} });
    const status=page.status;
    if (status<200 || status>=300) return result(id,'down',Math.round(performance.now()-start),status,'Website did not return HTTP 2xx');
    const size=Number(page.headers.get('content-length') || 0);
    if(size>262144) {await page.body?.cancel();return result(id,'degraded',Math.round(performance.now()-start),status,'Homepage response is larger than expected');}
    const html=await page.text();
    if (!/<html\b/i.test(html) || !/<\/html\s*>/i.test(html)) return result(id,'degraded',Math.round(performance.now()-start),status,'Response does not look like HTML');
    if (checkScript) {
      if (!/id=["']root["']/.test(html)) return result(id,'degraded',Math.round(performance.now()-start),status,'React mount point was not found');
      const js=html.match(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["']/i)?.[1];
      if(!js) return result(id,'degraded',Math.round(performance.now()-start),status,'Compiled JavaScript reference is missing');
      const asset=new URL(js,url);
      if(asset.origin!==url.origin || asset.username || asset.password) return result(id,'degraded',Math.round(performance.now()-start),status,'Compiled asset is not same-origin');
      const assetResp=await fetch(asset,{redirect:'manual',signal:AbortSignal.timeout(6500)});
      const assetStatus=assetResp.status;
      await assetResp.body?.cancel();
      if(assetStatus<200||assetStatus>=300) return result(id,'down',Math.round(performance.now()-start),assetStatus,'Compiled JavaScript asset failed');
    }
    const elapsed=Math.round(performance.now()-start);
    return result(id,elapsed>3500?'degraded':'healthy',elapsed,status,elapsed>3500?'Site response is slower than the threshold':'Static website and assets responded');
  } catch {return result(id,'down',Math.round(performance.now()-start),null,'Request failed or timed out');}
}

// A real database query detects failures that a public status page cannot.
async function checkDatabase(): Promise<Sample> {
  const start=performance.now();
  try {
    const {error}=await admin.from('organizers').select('id').limit(1);
    const elapsed=Math.round(performance.now()-start);
    return error
      ? result('supabase_database','down',elapsed,null,'Database API query failed')
      : result('supabase_database',elapsed>2500?'degraded':'healthy',elapsed,null,elapsed>2500?'Database is slow':'Database query completed');
  } catch { return result('supabase_database','down',Math.round(performance.now()-start),null,'Database API unavailable'); }
}

// A read-only Stytch API call validates credentials AND provider availability.
async function checkStytch(): Promise<Sample> {
  const pid=env('STYTCH_PROJECT_ID'), secret=env('STYTCH_SECRET'), org=env('STYTCH_ORGANIZATION_ID');
  const base=env('STYTCH_API_BASE');
  if([pid,secret,org].some(notSet)||!['https://test.stytch.com','https://api.stytch.com'].includes(base))
    return result('stytch_identity','unconfigured',null,null,'Authentication API monitor not configured');
  const start=performance.now();
  try {
    const response=await fetch(`${base}/v1/b2b/organizations/${encodeURIComponent(org)}`,{
      method:'GET',redirect:'manual',signal:AbortSignal.timeout(6500),
      headers:{Authorization:`Basic ${btoa(pid+':'+secret)}`},
    });
    const elapsed=Math.round(performance.now()-start);
    await response.body?.cancel();
    if(response.status===401||response.status===403)
      return result('stytch_identity','degraded',elapsed,response.status,'Probe credentials or permissions were rejected');
    if(!response.ok) return result('stytch_identity','down',elapsed,response.status,'Stytch organization API request failed');
    return result('stytch_identity',elapsed>3500?'degraded':'healthy',elapsed,response.status,elapsed>3500?'Stytch API is slow':'Stytch organization API responded');
  } catch {return result('stytch_identity','down',Math.round(performance.now()-start),null,'Stytch API request failed or timed out');}
}

// R2: check the actual bucket with an authenticated, read-only S3 operation.
// Never read/list student objects and never send R2 credentials to the browser.
async function checkR2():Promise<Sample>{
 const account=env('R2_ACCOUNT_ID'),bucket=env('R2_BUCKET');
 const key=env('MONITOR_R2_ACCESS_KEY_ID')||env('R2_ACCESS_KEY_ID');
 const secret=env('MONITOR_R2_SECRET_ACCESS_KEY')||env('R2_SECRET_ACCESS_KEY');
 if([account,bucket,key,secret].some(notSet))
  return result('cloudflare_r2','unconfigured',null,null,'Set R2_ACCOUNT_ID, R2_BUCKET and R2 read credentials in Edge Function secrets');
 if(!/^[a-f0-9]{32}$/i.test(account)||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket))
  return result('cloudflare_r2','unconfigured',null,null,'Invalid R2 account or bucket settings');
 const start=performance.now();
 const r2=new S3Client({region:'auto',endpoint:`https://${account}.r2.cloudflarestorage.com`,
  credentials:{accessKeyId:key,secretAccessKey:secret},
 });
 try{
  // AbortSignal prevents an unavailable provider from keeping a check open.
  await r2.send(new HeadBucketCommand({Bucket:bucket}),{abortSignal:AbortSignal.timeout(6500)});
  const ms=Math.round(performance.now()-start);
  return result('cloudflare_r2',ms>3500?'degraded':'healthy',ms,200,ms>3500?'R2 bucket check was slow':'R2 bucket is accessible');
 }catch(error){
  const ms=Math.round(performance.now()-start);
  const status=Number((error as { $metadata?:{httpStatusCode?:number}})?.$metadata?.httpStatusCode)||null;
  if(status===401||status===403)return result('cloudflare_r2','degraded',ms,status,'R2 health-check credential is missing permission');
  return result('cloudflare_r2','down',ms,status,'R2 bucket check failed or timed out');
 }finally{r2.destroy();}
}

// Google Drive: refresh a read-only OAuth credential server-side, then call about.
// Staging has no Drive setup by default. A missing adapter is never shown as healthy.
async function checkDrive():Promise<Sample>{
 const clientId=env('MONITOR_GOOGLE_CLIENT_ID'),clientSecret=env('MONITOR_GOOGLE_CLIENT_SECRET');
 const refresh=env('MONITOR_GOOGLE_REFRESH_TOKEN');
 if([clientId,clientSecret,refresh].some(notSet))
  return result('google_drive','unconfigured',null,null,'Google Drive health credentials not configured for this environment');
 const start=performance.now();
 try{
  const oauth=await fetch('https://oauth2.googleapis.com/token',{
   method:'POST',redirect:'manual',signal:AbortSignal.timeout(6500),
   headers:{'content-type':'application/x-www-form-urlencoded'},
   body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refresh,grant_type:'refresh_token'}),
  });
  if(!oauth.ok){await oauth.body?.cancel();return result('google_drive','degraded',Math.round(performance.now()-start),oauth.status,'Google OAuth health credential was rejected');}
  const token=await oauth.json() as {access_token?:string};
  if(!token.access_token)return result('google_drive','degraded',Math.round(performance.now()-start),null,'Google OAuth returned no access token');
  const response=await fetch('https://www.googleapis.com/drive/v3/about?fields=kind',{
   redirect:'manual',signal:AbortSignal.timeout(6500),headers:{Authorization:`Bearer ${token.access_token}`},
  });
  const ms=Math.round(performance.now()-start),status=response.status;
  await response.body?.cancel();
  if(status===401||status===403)return result('google_drive','degraded',ms,status,'Drive monitor token has no permitted read-only scope');
  if(!response.ok)return result('google_drive','down',ms,status,'Drive metadata endpoint did not respond');
  return result('google_drive',ms>3500?'degraded':'healthy',ms,status,ms>3500?'Google Drive API was slow':'Google Drive metadata API responded');
 }catch{return result('google_drive','down',Math.round(performance.now()-start),null,'Google Drive API failed or timed out');}
}

// Two consecutive failures open an incident; two healthy checks resolve it.
async function recordSample(sample: Sample) {
  const {data: previous,error:previousError}=await admin.from('monitor_checks')
    .select('state,checked_at').eq('service_id',sample.service_id).order('checked_at',{ascending:false}).limit(1);
  if(previousError) throw previousError;
  const {error:insertError}=await admin.from('monitor_checks').insert(sample);
  if(insertError) throw insertError;
  if(sample.state==='unconfigured') return;
  const wasBad=previous?.[0] && ['degraded','down'].includes(previous[0].state) &&
    Date.now()-new Date(previous[0].checked_at).getTime()<=180000;
  const isBad=['degraded','down'].includes(sample.state);
  const {data:open,error:incidentError}=await admin.from('monitor_incidents')
    .select('id,severity').eq('service_id',sample.service_id).is('resolved_at',null).maybeSingle();
  if(incidentError) throw incidentError;
  if(isBad && wasBad) {
    if(!open) {
      const {error}=await admin.from('monitor_incidents').insert({
        service_id:sample.service_id,severity:sample.state==='down'?'attention':'notice',
        headline:sample.state==='down'?'Service unavailable':'Service performance degraded',
      });
      if(error && error.code!=='23505') throw error; // A parallel run may already open it.
    } else {
      const {error}=await admin.from('monitor_incidents').update({
        last_detected_at:new Date().toISOString(),
        severity:sample.state==='down'?'attention':open.severity,
      }).eq('id',open.id);
      if(error) throw error;
    }
  }
  if(!isBad && sample.state==='healthy' && previous?.[0]?.state==='healthy' && open) {
    const {error}=await admin.from('monitor_incidents').update({resolved_at:new Date().toISOString()}).eq('id',open.id);
    if(error) throw error;
  }
}

Deno.serve(async (req:Request) => {
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:cors(req)});
  if(req.method!=='POST') return reply(req,{error:'Use POST'},405);
  const cronSecret=env('MONITOR_CRON_TOKEN');
  let allowed=Boolean(cronSecret && equalTokens(req.headers.get('X-Study0SG-Monitor-Key')||'',cronSecret));
  if(!allowed) {
    try {
      const actor=await authenticate(req);
      allowed=hasRole(actor,'fore_director') || hasRole(actor,'tech_security','technology') || hasRole(actor,'director','technology');
    } catch { /* This request is not an authorized monitoring operation. */ }
  }
  if(!allowed) return reply(req,{error:'Unauthorized monitoring request'},403);

  try {
    // One minute cadence; skip rapid repeats to reduce monitoring cost.
    const {data:latest,error:latestError}=await admin.from('monitor_checks').select('checked_at')
      .order('checked_at',{ascending:false}).limit(1);
    if(latestError) throw latestError;
    if(latest?.length && Date.now()-new Date(latest[0].checked_at).getTime()<40000)
      return reply(req,{ok:true,skipped:true,reason:'A recent monitoring run already exists'});

    const samples=await Promise.all([
      checkWebsite('organizer_portal','MONITOR_PORTAL_URL',true),
      checkWebsite('public_website','MONITOR_ASTRO_URL',false),
      checkDatabase(),checkStytch(),
      checkDrive(),checkR2(),
    ]);
    for(const id of serviceNames){const sample=samples.find(s=>s.service_id===id);if(sample) await recordSample(sample);}
    console.log(`[monitor-run] Probed ${samples.length} fixed services; no request contents stored`);
    return reply(req,{ok:true,checked:samples.length,at:new Date().toISOString()});
  } catch(error) {
    console.error('[monitor-run] Monitoring write failed:',error instanceof Error?error.name:'Error');
    return reply(req,{error:'Monitor run failed; check server configuration and database migration'},503);
  }
});
