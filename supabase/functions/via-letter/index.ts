/** Optional AI-assisted editable volunteer contribution draft.
 * Never certifies VIA, signs letters, mints Singpass proofs, or awards minutes.
 */
import {admin,authenticate} from '../_shared/portal-auth.ts';
import {portalAllowed,portalJson} from '../_shared/cors.ts';
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return portalJson(req,{},portalAllowed(req)?204:403);
 if(req.method!=='POST'||!portalAllowed(req))return portalJson(req,{error:'Origin denied'},403);
 let actor:Awaited<ReturnType<typeof authenticate>>;
 try{actor=await authenticate(req);}catch{return portalJson(req,{error:'Sign in to draft a letter'},401);}
 if(Number(req.headers.get('content-length')||0)>9000)return portalJson(req,{error:'Request too long'},413);
 let data:{title?:unknown;summary?:unknown;minutes?:unknown;department?:unknown};
 try{data=await req.json();}catch{return portalJson(req,{error:'Invalid form'},400);}
 const title=typeof data.title==='string'?data.title.trim():'',summary=typeof data.summary==='string'?data.summary.trim():'';
 if(title.length<5||title.length>200||summary.length<20||summary.length>2500||
    !Number.isInteger(data.minutes)||Number(data.minutes)<1||Number(data.minutes)>480){
   return portalJson(req,{error:'Add a title, a detailed summary and candidate minutes'},400);
 }
 const key=Deno.env.get('DEEPSEEK_API_KEY');
 if(!key)return portalJson(req,{error:'DeepSeek is not configured; you can still write your own summary'},503);
 const {error:quota}=await admin.rpc('v20_reserve_via_letter',{p_actor:actor.id});
 if(quota)return portalJson(req,{error:quota.message.slice(0,170)},429);
 try{
  const response=await fetch('https://api.deepseek.com/chat/completions',{
   method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
   body:JSON.stringify({model:Deno.env.get('DEEPSEEK_MODEL')||'deepseek-flash',max_tokens:650,temperature:0.2,
    messages:[
     {role:'system',content:'You draft a SHORT formal first-person account of completed work for a Study0SG volunteer to review. Use only facts in the supplied activity title, notes, and claimed duration. Do not invent dates, recipients, hours verified by others, Singpass identity, MOE/LEAPS accreditation, signatures, endorsements or letterhead. This is an UNVERIFIED DRAFT pending Fore Director review. The output should have a subject, polite greeting, 2 concise paragraphs, thanks, and a placeholder [Organizer name]. Avoid unnecessary browser/technical terminology.'},
     {role:'user',content:JSON.stringify({activity:title,work_summary:summary,claimed_minutes:data.minutes,department:String(data.department??'').slice(0,40)})},
    ]}),signal:AbortSignal.timeout(25000),
  });
  if(!response.ok)return portalJson(req,{error:`Draft provider unavailable (HTTP ${response.status}); retry later`},502);
  const json=await response.json() as {choices?:Array<{message?:{content?:unknown}}>};
  const draft=json.choices?.[0]?.message?.content;
  if(typeof draft!=='string'||!draft.trim())return portalJson(req,{error:'The draft response was empty'},502);
  return portalJson(req,{draft:draft.slice(0,4900),disclaimer:'AI draft only — minutes and any transcript require independent Fore Director review.'});
 }catch{return portalJson(req,{error:'AI drafting request failed or timed out'},503);}
});
