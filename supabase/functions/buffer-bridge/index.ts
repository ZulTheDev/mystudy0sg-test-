import { portalAllowed, portalCors } from '../_shared/cors.ts';
/** Study0SG authorized Buffer GraphQL bridge.
 * Browser never receives BUFFER_API_KEY. No arbitrary GraphQL passthrough.
 * Dispatch requires a separately approved database record and a department manager.
 */
import {authenticate,hasRole} from '../_shared/portal-auth.ts';
import {createClient} from 'npm:@supabase/supabase-js@2';
const cors = (request:Request) => ({...portalCors(request),
  'Content-Type':'application/json','Cache-Control':'no-store'});
const response=(body:unknown,status:number,headers:HeadersInit)=>new Response(JSON.stringify(body),{status,headers});
const key=Deno.env.get('BUFFER_API_KEY')??'';
async function gql(query:string,variables:Record<string,unknown>={}){
 if(!key)throw Error('Buffer API key has not been configured by Study0SG administrators');
 const r=await fetch('https://api.buffer.com',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${key}`},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(15000)});
 const result=await r.json() as {errors?:Array<{message:string}>;data?:Record<string,unknown>};
 if(!r.ok||result.errors?.length)throw Error(`Buffer unavailable or rejected request: ${result.errors?.[0]?.message??r.status}`);
 return result.data??{};
}
const orgChannels=async()=>{
 const account=await gql('query { account { organizations { id name } } }');
 const organizations=((account.account as {organizations?:Array<{id:string}>}|undefined)?.organizations??[]);
 const allowedId=Deno.env.get('BUFFER_ORGANIZATION_ID')??'';
 const org=organizations.find(x=>x.id===allowedId);
 if(!org)throw Error('Buffer organization not configured or not accessible by this API key');
 const data=await gql('query GetChannels($org:OrganizationId!){ channels(input:{organizationId:$org}){id name displayName service isQueuePaused}}',{org:org.id});
 return ((data.channels??[]) as Array<{id:string;name:string;service:string;isQueuePaused:boolean}>);
};
Deno.serve(async(request:Request)=>{
 const headers=cors(request);
 if(request.method==='OPTIONS')return new Response(null,{status:portalAllowed(request)?204:403,headers});
 if(request.method!=='POST')return response({error:'POST required'},405,headers);
 if(!portalAllowed(request))return response({error:'Origin denied; configure PORTAL_ORIGIN'},403,headers);
 try{
  const actor=await authenticate(request);
  const media=hasRole(actor,'media_crew','media')||actor.grants.some(g=>g.role==='director'&&g.department==='media');
  if(!media)return response({error:'Media department required'},403,headers);
  const input=await request.json() as {action?:unknown;postId?:unknown};
  if(input.action==='channels')return response({channels:await orgChannels()},200,headers);
  if(input.action!=='queue'||typeof input.postId!=='string'||!/^[0-9a-f-]{36}$/i.test(input.postId))return response({error:'Unknown action'},400,headers);
  const manager=hasRole(actor,'fore_director')||actor.grants.some(g=>g.role==='director'&&g.department==='media');
  if(!manager)return response({error:'Media Director approval required'},403,headers);
  // Supabase PostgREST independently checks the organizer JWT, permissions and approved status.
  const project=Deno.env.get('SUPABASE_URL')!;
  const keyPublic=Deno.env.get('SUPABASE_PUBLISHABLE_KEY')??Deno.env.get('SUPABASE_ANON_KEY')??'';
  const client=createClient(project,keyPublic,{global:{headers:{Authorization:request.headers.get('Authorization')!}},auth:{persistSession:false,autoRefreshToken:false}});
  const channels=await orgChannels();
  const {data:post,error:claimError}=await client.rpc('v16_social_dispatch_claim',{p_id:input.postId});
  if(claimError||!post)return response({error:claimError?.message??'Post not approved'},403,headers);
  const record=post as {id:string;text:string;channel_id:string};
  let resultId='';let providerError='';
  try{
   if(!channels.some(c=>c.id===record.channel_id&&!c.isQueuePaused))throw Error('Chosen Buffer channel unavailable or paused');
   const query=`mutation CreatePost($text:String!,$channel:ChannelId!){createPost(input:{text:$text,channelId:$channel,schedulingType:automatic,mode:addToQueue}){... on PostActionSuccess{post{id text}} ... on MutationError{message}}}`;
   const data=await gql(query,{text:record.text,channel:record.channel_id});
   const union=data.createPost as {post?:{id:string};message?:string}|undefined;
   if(!union?.post?.id)throw Error(union?.message??'Buffer did not confirm queuing');
   resultId=union.post.id;
  }catch(e){providerError=e instanceof Error?e.message:'Buffer error';}
  const {error:resultError}=await client.rpc('v16_social_dispatch_result',{p_id:record.id,p_status:providerError?'failed':'queued',p_provider_id:resultId,p_error:providerError});
  if(resultError)return response({error:'Buffer request completed but local status could not be confirmed. Reconcile directly in Buffer before retrying.'},502,headers);
  if(providerError)return response({error:providerError},502,headers);
  return response({status:'queued',postId:resultId},200,headers);
 }catch(e){return response({error:e instanceof Error?e.message:'Authentication or API error'},401,headers);}
});
