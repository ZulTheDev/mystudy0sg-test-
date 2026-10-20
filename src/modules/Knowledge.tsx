import {useCallback,useEffect,useMemo,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {db,getPortalToken} from '../supabase-portal';
import {mutation} from '../portal-data';

type Project={id:string;title:string;description:string;created_at:string};
type Thread={id:string;project_id:string|null;parent_thread_id:string|null;branch_message_id:string|null;title:string;assistant_profile:string;owner_id:string;created_at:string;updated_at:string};
type Message={id:string;thread_id:string;author_id:string|null;role:'user'|'assistant';body:string;model_tier:string;created_at:string};
type Person={id:string;display_name:string};
type Grant={role:string;department:string|null};
const swatches=['#b85c21','#237ba5','#7d62b6','#288463','#b35980','#a87924'];
function authorColour(id:string){let h=0;for(const c of id)h=(h*33+c.charCodeAt(0))|0;return swatches[(h>>>0)%swatches.length];}
function saveMarkdown(name:string,body:string){const url=URL.createObjectURL(new Blob([body],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}

export function Knowledge({actorId,isFore,grants}:{actorId:string;isFore:boolean;grants:Grant[]}){
 const [space,setSpace]=useState<'personal'|'organization'>('organization');
 const [projects,setProjects]=useState<Project[]>([]),[threads,setThreads]=useState<Thread[]>([]),[messages,setMessages]=useState<Message[]>([]),[directory,setDirectory]=useState<Person[]>([]);
 const [project,setProject]=useState<string|null>(null),[active,setActive]=useState<string|null>(null),[query,setQuery]=useState(''),[input,setInput]=useState(''),[tier,setTier]=useState<'standard'|'pro'>('standard');
 const [quota,setQuota]=useState({daily:0,monthly:0}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const canFolder=isFore||grants.some(g=>g.role==='director'||g.department==='executive');
 const canTech=isFore||grants.some(g=>g.role==='tech_security'||(g.role==='director'&&g.department==='technology'));
 const getData=useCallback(async()=>{
  const [p,t,u,people]=await Promise.all([
   db.from('ai_projects').select('id,title,description,created_at').is('archived_at',null).order('created_at',{ascending:false}).limit(100),
   db.from('ai_threads').select('id,project_id,parent_thread_id,branch_message_id,title,assistant_profile,owner_id,created_at,updated_at').order('created_at',{ascending:true}).limit(400),
   db.from('ai_usage').select('scope,tier,created_at').eq('organizer_id',actorId).order('created_at',{ascending:false}).limit(1500),
   db.rpc('v14_chat_directory')
  ]);
  if(p.error||t.error)throw Error(p.error?.message||t.error?.message);
  setProjects((p.data||[]) as Project[]);setThreads((t.data||[]) as Thread[]);
  if(!people.error)setDirectory((people.data||[]) as Person[]);
  if(!u.error){const day=new Date().toISOString().slice(0,10),month=day.slice(0,7);
   const usage=(u.data||[]) as Array<{scope:string;tier:string;created_at:string}>;
   setQuota({daily:usage.filter(v=>v.scope==='personal'&&v.tier==='standard'&&v.created_at.startsWith(day)).length,
    monthly:usage.filter(v=>v.scope==='personal'&&v.tier==='pro'&&v.created_at.startsWith(month)).length});}
 },[actorId]);
 const loadMessages=useCallback(async(id:string)=>{
  const {data,error:err}=await db.from('ai_messages').select('id,thread_id,author_id,role,body,model_tier,created_at').eq('thread_id',id).order('created_at',{ascending:true}).limit(500);
  if(err)throw Error(err.message);setMessages((data||[]) as Message[]);
 },[]);
 useEffect(()=>{void getData().catch(e=>setError(String(e)));},[getData]);
 useEffect(()=>{if(!active){setMessages([]);return;}
  void loadMessages(active).catch(e=>setError(String(e)));
  const ch=db.channel('ai-thread-'+active).on('postgres_changes',{event:'INSERT',schema:'public',table:'ai_messages',filter:'thread_id=eq.'+active},()=>{void loadMessages(active);}).subscribe();
  const interval=window.setInterval(()=>void loadMessages(active).catch(()=>{}),12000);
  return ()=>{window.clearInterval(interval);void db.removeChannel(ch);};
 },[active,loadMessages]);
 const current=threads.find(t=>t.id===active);
 const filtered=useMemo(()=>threads.filter(t=>(space==='personal'?t.project_id===null:t.project_id===project)&&t.title.toLowerCase().includes(query.trim().toLowerCase())),[threads,space,project,query]);
 const selectSpace=(s:'personal'|'organization')=>{setSpace(s);setActive(null);setError('');};
 const createProject=async()=>{
  const title=window.prompt('Project folder name (e.g. PSLE workshop planning)')?.trim();if(!title)return;
  setBusy(true);setError('');try{const id=await mutation<string>('ai_create_project',{p_title:title,p_description:''});await getData();setProject(id);setActive(null);setNotice('Project created. Organisers can now start subthreads.');}catch(e){setError(String(e));}finally{setBusy(false);}
 };
 const createThread=async(parent:string|null=null,reply:string|null=null)=>{
  if(space==='organization'&&!project){setError('Select a project folder before creating a thread.');return;}
  const title=window.prompt(parent?'Name this reply branch':'Name your discussion')?.trim();if(!title)return;
  const profile=canTech&&window.confirm('Use Tech & Security consultant for this thread?')?'tech_security':'general';
  setBusy(true);setError('');try{
   const id=await mutation<string>('ai_create_thread',{p_title:title,p_project_id:space==='personal'?null:project,p_parent_thread_id:parent,p_branch_message_id:reply,p_profile:profile});
   await getData();setActive(id);setNotice('Discussion created.');}
  catch(e){setError(String(e));}finally{setBusy(false);}
 };
 const send=async()=>{
  const prompt=input.trim();if(!active||!prompt||busy)return;const token=getPortalToken();
  if(!token){setError('Please sign in again.');return;}
  setBusy(true);setError('');setNotice('');
  try{
   const res=await fetch(import.meta.env.VITE_SUPABASE_URL+'/functions/v1/ai-workspace',{
    method:'POST',headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token},
    body:JSON.stringify({thread_id:active,prompt,tier})});
   const response=await res.json().catch(()=>({})) as {error?:string};
   if(!res.ok)throw Error(response.error||'Chat service unavailable');
   setInput('');await Promise.all([loadMessages(active),getData()]);
  }catch(e){setError(e instanceof Error?e.message:'Unable to send');await loadMessages(active).catch(()=>{});}
  finally{setBusy(false);}
 };
 const getName=(id:string|null)=>id===null?'Study0SG AI':id===actorId?'You':directory.find(p=>p.id===id)?.display_name||'Organiser';
 const nested=(t:Thread)=>{let n=0,p=t.parent_thread_id;while(p&&n<5){n++;p=threads.find(x=>x.id===p)?.parent_thread_id||null;}return n;};
 return <section className="ai-v23" aria-label="Study0SG AI workspaces">
  <header className="ai-v23-header"><div><span className="eyebrow">STUDY0SG · COLLABORATE</span><h2>Your AI, and your team's ideas.</h2><p>Personal chats stay private. Organisation projects let verified organisers build discussions together.</p></div>
   <div className="ai-v23-switch" role="group" aria-label="AI workspace"><button className={space==='organization'?'studio-tab-active':'secondary-button'} onClick={()=>selectSpace('organization')}>Team projects</button><button className={space==='personal'?'studio-tab-active':'secondary-button'} onClick={()=>selectSpace('personal')}>My personal AI</button></div></header>
  {error&&<p role="alert" className="error-alert">{error}</p>}{notice&&<p role="status" className="success-alert">{notice}</p>}
  <div className="ai-v23-body">
   <aside className="ai-v23-side">
    <label><span className="sr-only">Find chat</span><input placeholder="Search chat history…" type="search" value={query} onChange={e=>setQuery(e.target.value)}/></label>
    {space==='organization'?<>
     <div className="ai-v23-side-head"><strong>Project folders</strong>{canFolder&&<button disabled={busy} onClick={()=>void createProject()}>+ Folder</button>}</div>
     {projects.filter(p=>p.title.toLowerCase().includes(query.trim().toLowerCase())||!query).map(p=><button className={project===p.id?'ai-v23-folder chosen':'ai-v23-folder'} key={p.id} onClick={()=>{setProject(p.id);setActive(null);}}>▣ {p.title}</button>)}
     {project&&<button disabled={busy} className="secondary-button" onClick={()=>void createThread()}>+ New project thread</button>}
     {!projects.length&&<p className="hint">An EXCO member or Director can create the first project folder.</p>}
    </>:<>
     <div className="ai-v23-side-head"><strong>Private conversations</strong><button disabled={busy} onClick={()=>void createThread()}>+ New</button></div>
     <p className="hint">Standard: {Math.max(0,10-quota.daily)}/10 left today. Pro: {Math.max(0,4-quota.monthly)}/4 left this month (UTC).</p>
    </>}
    <nav className="ai-v23-thread-list" aria-label="Saved chats">
      {filtered.map(t=><button key={t.id} className={active===t.id?'chosen':''} style={{paddingLeft:12+nested(t)*15}} onClick={()=>setActive(t.id)}>{t.parent_thread_id?'↳':'◇'} {t.title}{t.assistant_profile==='tech_security'?' · 🛡':''}</button>)}
    </nav>
   </aside>
   <main className="ai-v23-main">{!current?<div className="ai-v23-empty"><strong>{space==='personal'?'Start a private conversation':'Select a project and start a thread'}</strong><p>Chats are saved to the Study0SG test database, not just this browser tab.</p></div>:<>
    <div className="ai-v23-chat-head"><div><strong>{current.title}</strong><p className="hint">{current.project_id?'Shared project':'Private'} · {current.assistant_profile==='tech_security'?'Tech & Security consultant':'General assistant'}</p></div><div className="record-actions">
      <button type="button" className="secondary-button" disabled={busy} onClick={()=>void createThread(current.id)}>↳ Branch</button>
      <button type="button" className="secondary-button" onClick={()=>saveMarkdown('Study0SG-chat.md',['# '+current.title,...messages.map(m=>'## '+getName(m.author_id)+' · '+m.created_at+'\n\n'+m.body)].join('\n\n'))}>↓ Export</button>
    </div></div>
    <div className="ai-v23-messages" aria-live="polite">{messages.map(m=><article className="ai-v23-message" key={m.id}><header><span className="ai-v23-dot" style={{background:authorColour(m.author_id||'study0sg-ai')}}/><strong style={{color:authorColour(m.author_id||'study0sg-ai')}}>{getName(m.author_id)}</strong><time>{new Date(m.created_at).toLocaleString('en-SG',{dateStyle:'short',timeStyle:'short'})}</time></header><div>{m.role==='assistant'?<ReactMarkdown remarkPlugins={[remarkGfm]}>{m.body}</ReactMarkdown>:<p>{m.body}</p>}</div>{current.project_id&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>void createThread(current.id,m.id)}>Branch from this reply</button>}</article>)}</div>
    <form className="ai-v23-compose" onSubmit={e=>{e.preventDefault();void send();}}><label htmlFor="ai-v23-prompt" className="sr-only">AI message</label><textarea id="ai-v23-prompt" rows={3} maxLength={3000} placeholder="Ask, plan or brainstorm together…" value={input} onChange={e=>setInput(e.target.value)}/><div className="record-actions"><label>Model <select value={tier} onChange={e=>setTier(e.target.value as 'standard'|'pro')}><option value="standard">Standard</option><option value="pro">Pro</option></select></label><button disabled={busy||input.trim().length<2}>{busy?'Working…':'Send ↗'}</button></div></form>
   </>}</main>
  </div>
  <p className="muted-note">Only approved Study0SG organisers can sign in. Please do not share student personal data, confidential documents or API keys with an AI model. AI results are drafts, not approved policies or VIA transcripts.</p>
 </section>;
}
