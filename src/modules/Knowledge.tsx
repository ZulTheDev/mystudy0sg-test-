import {useCallback,useEffect,useMemo,useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {db,getPortalToken} from '../supabase-portal';
import {mutation} from '../portal-data';
import {Notices} from './common';

type Project={id:string;title:string;description:string;department:string|null;creator_id:string;archived_at:string|null};
type Thread={id:string;project_id:string|null;parent_thread_id:string|null;branch_message_id:string|null;title:string;assistant_profile:string;owner_id:string;updated_at:string;created_at:string};
type Message={id:string;thread_id:string;author_id:string|null;role:'user'|'assistant';body:string;model_tier:string;created_at:string;reply_to:string|null};
type Colleague={id:string;display_name:string};
type Grant={role:string;department:string|null};
type Props={actorId:string;isFore:boolean;grants:Grant[]};
const palette=['#b95718','#1974a1','#7962b6','#26815f','#be5d7b','#ad7719','#47809e','#926245'];
function nameColor(id:string){let sum=0;for(let i=0;i<id.length;i++)sum=(sum*31+id.charCodeAt(i))|0;return palette[Math.abs(sum)%palette.length];}
export function Knowledge({actorId,isFore,grants}:Props){
 const [scope,setScope]=useState<'personal'|'organization'>('organization');
 const [projects,setProjects]=useState<Project[]>([]),[threads,setThreads]=useState<Thread[]>([]),[messages,setMessages]=useState<Message[]>([]),[people,setPeople]=useState<Colleague[]>([]);
 const [active,setActive]=useState<string|null>(null),[openedProject,setOpenedProject]=useState<string|null>(null),[input,setInput]=useState(''),[tier,setTier]=useState<'standard'|'pro'>('standard'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[note,setNote]=useState('');
 const [usage,setUsage]=useState<{daily:number;monthly:number}>({daily:0,monthly:0});
 const [branchFrom,setBranchFrom]=useState<string|null>(null);
 const [search,setSearch]=useState('');
 const canCreateFolder=isFore||grants.some(g=>g.role==='director'||g.department==='executive');
 const techAllowed=isFore||grants.some(g=>g.department==='technology');
 const me=people.find(p=>p.id===actorId)?.display_name??'You';
 const load=useCallback(async()=>{
  const [p,t,c,u]=await Promise.all([
   db.from('ai_projects').select('id,title,description,department,creator_id,archived_at').order('created_at',{ascending:false}).limit(200),
   db.from('ai_threads').select('id,project_id,parent_thread_id,branch_message_id,title,assistant_profile,owner_id,updated_at,created_at').order('updated_at',{ascending:false}).limit(350),
   db.rpc('v14_chat_directory'),
   db.from('ai_usage').select('scope,tier,created_at').eq('organizer_id',actorId).limit(1200),
  ]);
  if(p.error||t.error)throw Error(p.error?.message||t.error?.message||'Could not load AI folders. Apply v2 migration.');
  setProjects((p.data??[]) as Project[]);setThreads((t.data??[]) as Thread[]);
  if(!c.error)setPeople((c.data??[]) as Colleague[]);
  if(!u.error){const utcNow=new Date(),day=utcNow.toISOString().slice(0,10),month=utcNow.toISOString().slice(0,7);
   const records=(u.data??[]) as {scope:string;tier:string;created_at:string}[];
   setUsage({daily:records.filter(x=>x.scope==='personal'&&x.tier==='standard'&&x.created_at.startsWith(day)).length,
    monthly:records.filter(x=>x.scope==='personal'&&x.tier==='pro'&&x.created_at.startsWith(month)).length});}
 },[actorId]);
 useEffect(()=>{void load().catch(e=>setError(e instanceof Error?e.message:'AI workspace unavailable'));},[load]);
 const fetchMessages=useCallback(async(id:string)=>{const r=await db.from('ai_messages').select('id,thread_id,author_id,role,body,model_tier,created_at,reply_to').eq('thread_id',id).order('created_at',{ascending:true}).limit(200);
  if(r.error)throw Error(r.error.message);setMessages((r.data??[]) as Message[]);
 },[]);
 useEffect(()=>{if(!active){setMessages([]);return;}void fetchMessages(active).catch(e=>setError(String(e)));const timer=window.setInterval(()=>void fetchMessages(active).catch(()=>{}),7000);return()=>window.clearInterval(timer);},[active,fetchMessages]);
 const visibleThreads=useMemo(()=>threads.filter(t=>(scope==='personal'?!t.project_id:t.project_id===openedProject)&&(!search.trim()||t.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()))),[threads,scope,openedProject,search]);
 const selected=threads.find(t=>t.id===active);
 const addProject=async()=>{const title=window.prompt('Name your project folder (for example: PSLE Learning Workshop)');if(!title?.trim())return;
  const description=window.prompt('Short project purpose (optional)')??'';
  setBusy(true);setError('');try{const id=await mutation<string>('ai_create_project',{p_title:title,p_description:description,p_department:null});await load();setOpenedProject(id);setScope('organization');setActive(null);setNote('Project folder created. Any verified organizer can add subthreads.');}catch(e){setError(String(e));}finally{setBusy(false);}};
 const addThread=async(parent:string|null=null,messageId:string|null=null)=>{
  const inProject=scope==='organization';const project=inProject?openedProject:null;
  if(inProject&&!project){setError('Select or create an organization project folder first.');return;}
  const title=window.prompt(parent?'Name this discussion branch':'Name your chat / subthread');if(!title?.trim())return;
  const useTech=techAllowed&&window.confirm('Use the dedicated Tech & Security consultant for this chat?\nChoose Cancel for the general assistant.');
  setBusy(true);setError('');try{
   const id=await mutation<string>('ai_create_thread',{p_title:title,p_project_id:project,p_parent_thread_id:parent,p_branch_message_id:messageId,p_profile:useTech?'tech_security':'general'});
   await load();setActive(id);setBranchFrom(null);setNote(parent?'Discussion branch created.':'Chat saved to your workspace.');
  }catch(e){setError(String(e));}finally{setBusy(false);}
 };
 const send=async()=>{const prompt=input.trim(),id=active,token=getPortalToken();if(!prompt||!id||busy)return;
  if(!token){setError('Session expired. Sign in again.');return;}
  setBusy(true);setError('');setInput('');try{
   const r=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-workspace`,{
    method:'POST',headers:{'Content-Type':'application/json','apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Authorization':`Bearer ${token}`},
    body:JSON.stringify({thread_id:id,prompt,tier,reply_to:branchFrom})});
   const body=await r.json().catch(()=>({})) as {error?:string;answer?:string};
   if(!r.ok)throw Error(body.error||`AI unavailable (HTTP ${r.status})`);
   setBranchFrom(null);await Promise.all([fetchMessages(id),load()]);
  }catch(e){setError(e instanceof Error?e.message:'Request failed');await fetchMessages(id).catch(()=>{});await load().catch(()=>{});}
  finally{setBusy(false);}
 };
 const depth=(thread:Thread)=>{let i=0,p=thread.parent_thread_id;while(p&&i<5){i++;p=threads.find(t=>t.id===p)?.parent_thread_id??null;}return i;};
 return <section className="ai-hub" aria-label="Study0SG AI project and personal assistants">
  <div className="ai-hub-intro"><div><span className="eyebrow">STUDY0SG AI WORKSPACES</span><h2>One assistant for you. One workspace for the team.</h2><p>Project conversations are visible to verified organizers. Personal chats are visible only to you. No registration tutorial—you're already part of Study0SG.</p></div>
   <div className="ai-hub-switch" role="group" aria-label="AI workspace type"><button className={scope==='organization'?'studio-tab-active':'secondary-button'} onClick={()=>{setScope('organization');setActive(null);}}>Shared projects</button><button className={scope==='personal'?'studio-tab-active':'secondary-button'} onClick={()=>{setScope('personal');setActive(null);}}>My private AI</button></div>
  </div>
  <Notices error={error} success={note}/>
  <div className="ai-hub-grid">
   <aside className="ai-hub-sidebar" aria-label="Projects and chat history">
    <label className="ai-history-search"><span className="sr-only">Search saved chat titles</span><input type="search" value={search} maxLength={80} onChange={e=>setSearch(e.target.value)} placeholder="⌕ Find a saved chat…"/></label>
    {scope==='organization'?<><div className="ai-hub-sidebar-heading"><strong>Organization projects</strong>{canCreateFolder&&<button disabled={busy} onClick={()=>void addProject()}>+ Folder</button>}</div>
      <p className="hint">EXCO, Fore Directors and Directors create folders. All verified members can create threads and branches.</p>
      {projects.filter(x=>!x.archived_at&&(!search.trim()||p.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())||threads.some(t=>t.project_id===p.id&&t.title.toLocaleLowerCase().includes(search.toLocaleLowerCase())))).map(p=><button key={p.id} className={`ai-folder ${openedProject===p.id?'active':''}`} onClick={()=>{setOpenedProject(p.id);setActive(null);}}>📁 {p.title}</button>)}
      {!projects.length&&<p className="hint">No project folders yet. Ask a Director to create one.</p>}
    </>:<><div className="ai-hub-sidebar-heading"><strong>Your private chats</strong><button disabled={busy} onClick={()=>void addThread()}>+ Chat</button></div>
      <p className="hint">Standard: {Math.max(0,10-usage.daily)}/10 messages remaining today (UTC). Pro: {Math.max(0,4-usage.monthly)}/4 this month.</p>
    </>}
    {scope==='organization'&&openedProject&&<button className="ai-add-thread" disabled={busy} onClick={()=>void addThread()}>+ New project subthread</button>}
    <div className="ai-thread-list">{visibleThreads.slice().sort((a,b)=>a.created_at.localeCompare(b.created_at)).map(t=><button key={t.id} className={`ai-thread-row ${active===t.id?'active':''}`} style={{paddingLeft:12+depth(t)*15}} onClick={()=>{setActive(t.id);setBranchFrom(null);}}><span>{t.parent_thread_id?'↳':'💬'} {t.title}</span>{t.assistant_profile==='tech_security'&&<small>🛡 Tech consultant</small>}</button>)}</div>
   </aside>
   <div className="ai-hub-chat">
    {!selected?<div className="ai-empty-chat"><span aria-hidden="true">✦</span><h3>{scope==='personal'?'A space for your own ideas':'Build ideas together in project threads'}</h3><p>Choose a saved chat or create a new one. Each discussion retains its messages for the next time you open it.</p></div>:<>
     <header className="ai-chat-top"><div><strong>{selected.title}</strong><p>{selected.project_id?'Shared Study0SG project':'Private to you'} · {selected.assistant_profile==='tech_security'?'Tech & Security consultant':'General work assistant'}</p></div><div className="ai-chat-toolbar"><button className="secondary-button" type="button" disabled={busy} onClick={()=>void addThread(selected.id)}>↳ Branch chat</button><button type="button" className="secondary-button" onClick={()=>{const lines=[`# ${selected.title}`,`Shared: ${Boolean(selected.project_id)}`,`Exported: ${new Date().toISOString()}`,'',...messages.map(m=>`## ${m.role==='assistant'?'Study0SG AI':people.find(x=>x.id===m.author_id)?.display_name??'Organizer'} · ${new Date(m.created_at).toLocaleString('en-SG')}\n\n${m.body}\n`)];const file=new Blob([lines.join('\n')],{type:'text/markdown'});const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=`Study0SG-chat-${selected.id.slice(0,8)}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}>↓ Export chat</button></div></header>
     <div className="ai-messages" aria-live="polite">{messages.map(m=><article className={`ai-message ${m.role}`} key={m.id}><div className="ai-message-head"><span className="ai-author-dot" style={{backgroundColor:m.role==='assistant'?'#9b7bce':nameColor(m.author_id??'')}}/><strong style={{color:m.role==='assistant'?'#795bb2':nameColor(m.author_id??'')}}>{m.role==='assistant'?'Study0SG AI':m.author_id===actorId?me:(people.find(p=>p.id===m.author_id)?.display_name??'Organizer')}</strong><time>{new Date(m.created_at).toLocaleString('en-SG',{dateStyle:'short',timeStyle:'short'})}</time></div><div className="ai-message-body">{m.role==='assistant'?<ReactMarkdown remarkPlugins={[remarkGfm]}>{m.body}</ReactMarkdown>:<p>{m.body}</p>}</div>{selected.project_id&&<button className="ai-branch-button" type="button" disabled={busy} onClick={()=>void addThread(selected.id,m.id)}>↳ Create a branch from this reply</button>}</article>)}</div>
     {branchFrom&&<p className="hint">Next message will refer to the selected reply. <button type="button" onClick={()=>setBranchFrom(null)}>Clear</button></p>}
     <form className="ai-chat-compose" onSubmit={e=>{e.preventDefault();void send();}}><label className="sr-only" htmlFor="ai-prompt">Your message</label><textarea id="ai-prompt" rows={3} maxLength={3000} placeholder="Plan an event, compare ideas, draft a letter, or ask for technical help…" value={input} onChange={e=>setInput(e.target.value)}/><div className="ai-compose-actions"><label>Model <select value={tier} onChange={e=>setTier(e.target.value as 'standard'|'pro')}><option value="standard">Standard · DeepSeek</option><option value="pro">Pro · Higher quota cost</option></select></label><button disabled={busy||input.trim().length<2}>{busy?'Thinking…':'Send message ↗'}</button></div></form>
    </>}
   </div>
  </div>
  <p className="muted-note">AI messages use DeepSeek through a protected Edge Function and are stored in the matching Supabase project. Personal message limits are per organizer, not per tab. Org chats have an additional server-side fair-use cap. Never share student PII, credentials or unpublished confidential files with an AI provider. No automatic decisions or school-approved transcripts are generated here.</p>
 </section>;
}
