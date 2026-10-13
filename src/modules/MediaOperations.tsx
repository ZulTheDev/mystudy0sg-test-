import {useEffect,useState} from 'react';
import {db} from '../supabase-portal';
import {mutation} from '../portal-data';
import {useRecords,useNotice,Notices,Field,Empty} from './common';
import {downloadText} from '../v14-utils';

type EventChoice={id:string;title:string;starts_at:string;status:string};
type Question={id:string;label:string;type:'text'|'choice';required:boolean;options:string[]};
type FormRow={id:string;event_id:string;title:string;schema_json:{questions?:Question[]};status:string;form_version:number;created_at:string};
type Handoff={id:string;event_id:string;registered_count:number;confirmed_count:number;status:string;created_at:string};
const makeQuestion=():Question=>({id:crypto.randomUUID(),label:'',type:'text',required:false,options:[]});
export function MediaOperations({manager}:{manager:boolean}){
 const forms=useRecords<FormRow>('registration_forms','id,event_id,title,schema_json,status,form_version,created_at');
 const handoffs=useRecords<Handoff>('event_handoffs','id,event_id,registered_count,confirmed_count,status,created_at');
 const action=useNotice();const[events,setEvents]=useState<EventChoice[]>([]);const[eventId,setEventId]=useState('');
 const[editing,setEditing]=useState<string|null>(null);const[title,setTitle]=useState('');const[questions,setQuestions]=useState<Question[]>([makeQuestion()]);const[notes,setNotes]=useState('');
 useEffect(()=>{void (async()=>{const {data,error}=await db.rpc('v14_event_directory');if(error)action.setError(error.message);else{setEvents((data??[]) as EventChoice[]);}})();},[]);
 const save=async()=>{const clean=questions.filter(q=>q.label.trim()).map(q=>({...q,label:q.label.trim().slice(0,150),options:q.type==='choice'?q.options.slice(0,10):[]}));
  if(!eventId)throw new Error('Select an event first');
  if(clean.length===0)throw new Error('Include at least one question');
  await mutation('v14_save_form',{p_event_id:eventId,p_title:title,p_schema:{questions:clean},p_id:editing});
  await forms.refresh();setEditing(null);setTitle('');setQuestions([makeQuestion()]);};
 const selected=events.find(e=>e.id===eventId);
 return <section className="module-section">
  <p className="section-lead">Build and save event interest-form drafts. Public sign-up remains disabled until guardian-consent verification, privacy notice, spam controls and email delivery are configured. No registration link is published yet.</p>
  <Notices loading={forms.loading||handoffs.loading} error={forms.error||handoffs.error||action.error} success={action.notice}/>
  <div className="editor-box"><h3>{editing?'Update form draft':'Create an event form draft'}</h3>
   <div className="form-grid">
    <Field label="Event"><select value={eventId} onChange={e=>setEventId(e.target.value)}><option value="">Choose event</option>{events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></Field>
    <Field label="Form title"><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={160} placeholder="e.g. Saturday Science Interest"/></Field>
   </div>
   <h3>Questions (avoid NRIC, date of birth and unnecessary personal information)</h3>
   {questions.map((q,i)=><div className="v14-row" key={q.id}>
      <input aria-label={`Question ${i+1}`} placeholder={`Question ${i+1}`} value={q.label} maxLength={150} onChange={e=>setQuestions(v=>v.map(x=>x.id===q.id?{...x,label:e.target.value}:x))}/>
      <select aria-label={`Question ${i+1} type`} value={q.type} onChange={e=>setQuestions(v=>v.map(x=>x.id===q.id?{...x,type:e.target.value as Question['type']}:x))}><option value="text">Short answer</option><option value="choice">Choice</option></select>
      <label className="v14-inline"><input type="checkbox" checked={q.required} onChange={e=>setQuestions(v=>v.map(x=>x.id===q.id?{...x,required:e.target.checked}:x))}/> Required</label>
      <button type="button" className="secondary-button" disabled={questions.length===1} onClick={()=>setQuestions(v=>v.filter(x=>x.id!==q.id))}>Remove</button>
      {q.type==='choice'&&<input className="v14-full" aria-label="Comma-separated choices" placeholder="Choices separated by commas" value={q.options.join(', ')} onChange={e=>setQuestions(v=>v.map(x=>x.id===q.id?{...x,options:e.target.value.split(',').map(s=>s.trim())}:x))}/>}
   </div>)}
   <div className="record-actions"><button className="secondary-button" type="button" onClick={()=>setQuestions(v=>[...v,makeQuestion()])} disabled={questions.length>=10}>+ Add question</button>
     <button type="button" disabled={action.busy||!title.trim()||!eventId} onClick={()=>void action.run(save,'Draft saved to Supabase')}>Save draft</button></div>
  </div>
  <h3>Saved drafts</h3>
  {!forms.data.length?<Empty>No forms saved yet. First create an event in Community & Events, then choose it above.</Empty>:<div className="record-list">{forms.data.map(f=><article className="record-card" key={f.id}>
   <div className="record-top"><strong>{f.title}</strong><span>{f.status} · v{f.form_version}</span></div>
   <p>{events.find(e=>e.id===f.event_id)?.title??'Event'} · {(f.schema_json.questions??[]).length} custom questions</p>
   <button type="button" className="secondary-button" onClick={()=>{setEditing(f.id);setEventId(f.event_id);setTitle(f.title);setQuestions(f.schema_json.questions?.length?f.schema_json.questions:[makeQuestion()]);}}>Edit draft</button>
   <button type="button" className="secondary-button" onClick={()=>downloadText(`study0sg-form-${f.id}.json`,JSON.stringify({title:f.title,event_id:f.event_id,questions:f.schema_json.questions},null,2),'application/json')}>Export form JSON</button>
  </article>)}</div>}
  <h3>Send registration counts to Community</h3>
  <p>After an approved participant intake service exists, a Media Director can create a count snapshot and Community can review it. Form drafts themselves do not collect registrations.</p>
  {manager?<div className="form-grid"><Field label="Event to hand over"><select value={eventId} onChange={e=>setEventId(e.target.value)}><option value="">Select event</option>{events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></Field>
   <Field label="Handover note"><input value={notes} onChange={e=>setNotes(e.target.value)} maxLength={1200} placeholder="e.g. Registration review complete"/></Field>
   <div className="form-actions"><button type="button" disabled={!eventId||action.busy} onClick={()=>void action.run(async()=>{await mutation('v14_submit_handoff',{p_event_id:eventId,p_notes:notes});await handoffs.refresh();},'Snapshot sent to Community')}>Submit count snapshot</button></div></div>:<p className="hint">Media Director approval is required to submit a handover.</p>}
  <div className="record-list">{handoffs.data.map(h=><article className="record-card" key={h.id}><strong>{events.find(e=>e.id===h.event_id)?.title??'Event'}</strong><div className="record-meta"><span>Registered: {h.registered_count}</span><span>Confirmed: {h.confirmed_count}</span><span>{h.status}</span></div></article>)}</div>
  <p className="muted-note">This module does not claim to offer Singpass login, live public signup, social autoposting or a public Excel link.</p>
  {selected&&<p className="muted-note">Selected event: {selected.title}</p>}
 </section>;
}
