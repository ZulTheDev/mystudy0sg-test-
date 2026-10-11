// Fore Director-only source ingestion. Accepts reviewed plain text, not PDFs.
// PDF parsing and academic QA should be added as a separate review workflow.
import { authenticate, hasRole, admin } from '../_shared/portal-auth.ts';
const origin=Deno.env.get('PORTAL_ORIGIN')??'';
const key=Deno.env.get('OPENAI_API_KEY')??'';
const departmentNames=['executive','support','community','media','technology','education'];
const model='text-embedding-3-small';
function reply(body:unknown,status=200){return new Response(JSON.stringify(body),{
  status,headers:{'Content-Type':'application/json','Cache-Control':'no-store',
   'Access-Control-Allow-Origin':origin,'Vary':'Origin',
   'Access-Control-Allow-Headers':'authorization,apikey,content-type',
   'Access-Control-Allow-Methods':'POST,OPTIONS'}});}
async function sha256(text:string){const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return Array.from(new Uint8Array(data),x=>x.toString(16).padStart(2,'0')).join('');}
function chunk(text:string){const words=text.split(/\s+/).filter(Boolean);const out:string[]=[];
 for(let index=0;index<words.length;index+=344){out.push(words.slice(index,index+384).join(' '));if(out.length>60)break;}
 return out;}
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return reply({},204);
  if(req.method!=='POST'||req.headers.get('Origin')!==origin)return reply({error:'Forbidden'},403);
  try{
    const actor=await authenticate(req);
    if(!hasRole(actor,'fore_director'))return reply({error:'Fore Director only'},403);
    if(Number(req.headers.get('content-length')||0)>60000)return reply({error:'Too much content'},413);
    const input=await req.json() as Record<string,unknown>;
    const title=typeof input.title==='string'?input.title.trim():'';
    const text=typeof input.text==='string'?input.text.trim():'';
    const department=typeof input.department==='string'?input.department:'';
    if(title.length<3||title.length>160||text.length<60||text.length>40000||
      !departmentNames.includes(department)||input.confirm_safe!==true){
      return reply({error:'Provide a title, 60–40,000 characters of reviewed non-sensitive text, a department, and explicit review confirmation.'},400);
    }
    if(!key)return reply({error:'OPENAI_API_KEY is not configured'},503);
    const pieces=chunk(text);
    if(pieces.length>60)return reply({error:'Document is too long'},400);
    const response=await fetch('https://api.openai.com/v1/embeddings',{
      method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
      body:JSON.stringify({model,input:pieces}),signal:AbortSignal.timeout(22000)
    });
    if(!response.ok)throw new Error('embedding_provider_failed');
    const raw=await response.json() as {data:Array<{index:number;embedding:number[]}>};
    if(raw.data.length!==pieces.length||raw.data.some(x=>x.embedding.length!==1536))throw new Error('embedding_shape_invalid');
    const fingerprint=await sha256(text);
    const {data:doc,error:docError}=await admin.from('knowledge_documents').insert({
      title,source_storage_key:`inline/${fingerprint}`,
      sha256:fingerprint,classification:'internal',collection:'organization',
      allowed_departments:[department],embedding_model:model,corpus_version:1,
      license_status:'approved',approved_at:new Date().toISOString(),reviewed_by:actor.id,
    }).select('id').single();
    if(docError){if(docError.code==='23505')return reply({error:'This resource was already indexed'},409);
      throw new Error('document_create_failed');}
    const batch=await Promise.all(raw.data.map(async v=>({
      document_id:doc.id,chunk_index:v.index,page_from:1,page_to:1,
      content:pieces[v.index],content_sha256:await sha256(pieces[v.index]),
      embedding:JSON.stringify(v.embedding),
    })));
    const {error:chunkError}=await admin.from('knowledge_vectors').insert(batch);
    if(chunkError){await admin.from('knowledge_documents').delete().eq('id',doc.id);
      throw new Error('vector_insert_failed');}
    await admin.from('audit_logs').insert({actor_id:actor.id,event_code:'knowledge.ingested',severity:'notice',outcome:'completed',department,details:{document_id:doc.id,chunk_count:pieces.length}});
    return reply({document_id:doc.id,chunk_count:pieces.length});
  }catch(_error){return reply({error:'Knowledge ingestion failed. Check Edge Function logs.'},503);}
});
