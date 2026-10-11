import {useState} from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {askKnowledge,mutation,type ChatSource,type Department,type KnowledgeDoc} from '../portal-data';
import {getPortalToken} from '../supabase-portal';
import {Field,Notices,useNotice,useRecords,deptLabels} from './common';

type ChatMessage={role:'user'|'assistant';content:string;sources?:ChatSource[]};
export function Knowledge({isFore}:{isFore:boolean}){
  const [messages,setMessages]=useState<ChatMessage[]>([]);
  const [question,setQuestion]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const [title,setTitle]=useState('');const [text,setText]=useState('');
  const [department,setDepartment]=useState<Department>('executive');const[confirmed,setConfirmed]=useState(false);
  const ingest=useNotice();
  const documents=useRecords<KnowledgeDoc>('knowledge_documents','id,title,collection,approved_at');
  const send=async()=>{
    const q=question.trim();if(!q||q.length>1200||busy)return;
    const token=getPortalToken();if(!token){setError('Session expired; sign in again.');return;}
    const previous=messages.map(m=>({role:m.role,content:m.content}));
    setBusy(true);setError('');setQuestion('');setMessages(old=>[...old,{role:'user',content:q}]);
    try{const reply=await askKnowledge(q,previous,token);setMessages(old=>[...old,{role:'assistant',content:reply.answer,sources:reply.sources}]);}
    catch(e){setError(e instanceof Error?e.message:'AI assistant failed');}
    finally{setBusy(false);}
  };
  const addText=async()=>{
    const token=getPortalToken();if(!token)throw new Error('Session expired');
    const res=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/knowledge-ingest`,{
      method:'POST',headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`},
      body:JSON.stringify({title,text,department,confirm_safe:confirmed})
    });
    const body=await res.json().catch(()=>null) as {error?:string}|null;
    if(!res.ok)throw new Error(body?.error||`Ingestion error (${res.status})`);
    setTitle('');setText('');setConfirmed(false);await documents.refresh();
  };
  return <section className="module-section">
    <p className="section-lead">Ask questions about <strong>approved internal Study0SG documents</strong>. Answers use retrieved sources and may decline to answer if evidence is missing. The AI has no write or delete permissions.</p>
    <div className="chat-window" aria-live="polite" aria-label="AI conversation">
      {!messages.length&&<p className="empty-state">Start with “What are our onboarding requirements?” or “How do I submit evidence for VIA hours?”</p>}
      {messages.map((m,i)=><article key={i} className={`chat-bubble ${m.role}`}>
        <span className="eyebrow">{m.role==='user'?'YOU':'STUDY0SG ASSISTANT'}</span>
        {m.role==='assistant'?<ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>:<p>{m.content}</p>}
        {!!m.sources?.length&&<details className="source-details"><summary>View {m.sources.length} retrieved source(s)</summary>
          <ol>{m.sources.map((s,j)=><li key={`${s.document_id}-${j}`}>{s.title} · passage {j+1} (text/page reference {s.page_from}–{s.page_to})</li>)}</ol>
        </details>}
      </article>)}
      {busy&&<p className="hint" role="status">Searching approved knowledge and preparing a cited response…</p>}
    </div>
    <Notices error={error}/>
    <form className="chat-compose" onSubmit={e=>{e.preventDefault();void send();}}>
      <label className="sr-only" htmlFor="ask-ai">Message to Study0SG AI</label>
      <textarea id="ask-ai" value={question} maxLength={1200} rows={2} onChange={e=>setQuestion(e.target.value)} placeholder="Ask the Study0SG knowledge assistant…"/>
      <button disabled={busy||question.trim().length<2}>{busy?'Working…':'Send'}</button>
    </form>
    {isFore&&<details className="editor-box knowledge-admin"><summary>+ Add a reviewed knowledge resource (Fore Director)</summary>
      <p className="hint">Start with plain text. PDF extraction, Drive sync and independent academic QA are not implemented in this release. Only submit content you are authorised to send to your AI provider; no student information or secrets.</p>
      <Notices error={ingest.error} success={ingest.notice}/>
      <form className="form-grid" onSubmit={e=>{e.preventDefault();void ingest.run(addText,'Knowledge indexed. You can now ask questions about it.');}}>
        <Field label="Resource title"><input required minLength={3} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
        <Field label="Visible to department"><select value={department} onChange={e=>setDepartment(e.target.value as Department)}>{(Object.keys(deptLabels) as Department[]).map(d=><option key={d} value={d}>{deptLabels[d]}</option>)}</select></Field>
        <Field label="Reviewed internal source text (60–40,000 characters)"><textarea required minLength={60} maxLength={40000} rows={9} value={text} onChange={e=>setText(e.target.value)}/></Field>
        <label className="check-label"><input type="checkbox" required checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> I confirm this text is reviewed, licensed for internal use, and contains no secrets or personal student information.</label>
        <button disabled={ingest.busy||!confirmed}>{ingest.busy?'Indexing…':'Index resource'}</button>
      </form>
      <div className="list-head"><strong>Approved internal resources</strong><button type="button" className="secondary-button" onClick={()=>void documents.refresh()}>Refresh</button></div>
      <Notices error={documents.error}/>
      <div className="record-list">{documents.data.filter(d=>d.approved_at).map(d=><div key={d.id} className="record-top record-inline"><span>{d.title}</span>
        <button type="button" className="danger-button" disabled={ingest.busy} onClick={()=>{if(window.confirm(`Retire ${d.title} from AI retrieval?`))void ingest.run(async()=>{await mutation('portal_knowledge_retire',{p_document_id:d.id});await documents.refresh();},'Resource retired from AI search');}}>Retire</button>
      </div>)}</div>
    </details>}
  </section>;
}
