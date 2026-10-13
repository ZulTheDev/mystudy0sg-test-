import { portalAllowed, portalCors } from '../_shared/cors.ts';
// Restricted OSV package vulnerability lookup. Does not install or execute packages.
import {authenticate,hasRole} from '../_shared/portal-auth.ts';
const cors = (request:Request) => ({...portalCors(request),
  'Content-Type':'application/json','Cache-Control':'no-store'});
const allowedEcosystems=['npm','PyPI','Go','Maven','RubyGems','crates.io','NuGet','Packagist'];
Deno.serve(async req=>{
 const headers=cors(req);
 if(req.method==='OPTIONS')return new Response(null,{status:portalAllowed(req)?204:403,headers});
 if(req.method!=='POST')return new Response(JSON.stringify({error:'POST required'}),{status:405,headers});
 if(!portalAllowed(req))return new Response(JSON.stringify({error:'Origin denied'}),{status:403,headers});
 try{
  const actor=await authenticate(req);
  if(!hasRole(actor,'tech_security','technology')&&!actor.grants.some(g=>g.role==='director'&&g.department==='technology'))
   return new Response(JSON.stringify({error:'Technology access required'}),{status:403,headers});
  const input=await req.json() as {ecosystem?:unknown;name?:unknown;version?:unknown};
  const ecosystem=typeof input.ecosystem==='string'?input.ecosystem:'';
  const name=typeof input.name==='string'?input.name.trim():'';
  const version=typeof input.version==='string'?input.version.trim():'';
  if(!allowedEcosystems.includes(ecosystem)||name.length<1||name.length>100||version.length<1||version.length>80||!/^[-@\w./+]+$/.test(name)||!/^[-\w.+:]+$/.test(version))
   return new Response(JSON.stringify({error:'Invalid ecosystem, package name, or version'}),{status:400,headers});
  const response=await fetch('https://api.osv.dev/v1/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,package:{name,ecosystem}}),signal:AbortSignal.timeout(12000)});
  if(!response.ok)return new Response(JSON.stringify({error:`Advisory provider unavailable (${response.status})`}),{status:502,headers});
  const body=await response.json() as {vulns?:Array<{id:string;summary?:string;details?:string;references?:Array<{url:string}>;modified?:string}>};
  const result={provider:'OSV.dev',checked_at:new Date().toISOString(),package:{ecosystem,name,version},vulnerabilities:(body.vulns??[]).slice(0,40).map(v=>({id:v.id,summary:(v.summary??'No summary').slice(0,500),modified:v.modified,reference:v.references?.find(r=>r.url.startsWith('https://'))?.url??`https://osv.dev/vulnerability/${encodeURIComponent(v.id)}`})),total:(body.vulns??[]).length,notice:'No findings does not mean the package is safe. Check provenance, maintainers, pinned hashes and update policy too.'};
  return new Response(JSON.stringify(result),{status:200,headers});
 }catch(e){return new Response(JSON.stringify({error:e instanceof Error?e.message:'Lookup failed'}),{status:401,headers});}
});
