import {useEffect,useState} from 'react';
import {db} from '../supabase-portal';
import {mutation} from '../portal-data';
import {downloadXlsx} from '../v14-utils';
import {useRecords,useNotice,Notices,Empty,Field} from './common';

type EventChoice={id:string;title:string;starts_at:string;status:string};
type Handoff={id:string;event_id:string;registered_count:number;confirmed_count:number;status:string;notes:string|null;created_at:string};
type Candidate={registration_id:string;participant_name:string;interest_data:Record<string,unknown>};
type GroupPlan={id:string;event_id:string;title:string;group_count:number;assignments:{id:string;group:number}[];status:string};
export function CommunityOperations({manager}:{manager:boolean}){
 const handoffs=useRecords<Handoff>('event_handoffs','id,event_id,registered_count,confirmed_count,status,notes,created_at');
 const plans=useRecords<GroupPlan>('v14_group_plans','id,event_id,title,group_count,assignments,status');
 const notice=useNotice();const[events,setEvents]=useState<EventChoice[]>([]);const[eventId,setEventId]=useState('');const[candidates,setCandidates]=useState<Candidate[]>([]);
 const[count,setCount]=useState(3);const[planName,setPlanName]=useState('Group proposal');const[assignments,setAssignments]=useState<Record<string,number>>({});
 useEffect(()=>{void (async()=>{const {data,error}=await db.rpc('v14_event_directory');if(error)notice.setError(error.message);else setEvents((data??[]) as EventChoice[]);})();},[]);
 const load=async()=>{if(!eventId)return;const {data,error}=await db.rpc('v14_group_candidates',{p_event_id:eventId});if(error)throw new Error(error.message);
  const list=(data??[]) as Candidate[];setCandidates(list);setAssignments(Object.fromEntries(list.map((c,i)=>[c.registration_id,i%count+1])));};
 const generate=()=>setAssignments(Object.fromEntries(candidates.map((c,i)=>[c.registration_id,i%count+1])));
 const save=async()=>{await mutation('v14_save_group_plan',{p_event_id:eventId,p_title:planName,p_group_count:count,p_assignments:candidates.map(c=>({id:c.registration_id,group:assignments[c.registration_id]??1}))});await plans.refresh();};
 const exportData=()=>downloadXlsx(`Study0SG-Community-${eventId.slice(0,8)}.xlsx`,['Group','Participant','Registration ID','Interest (non-sensitive)'],candidates.map(c=>[assignments[c.registration_id]??1,c.participant_name,c.registration_id,JSON.stringify(c.interest_data??{})]));
 return <section className="module-section">
  <p className="section-lead">Review Media's snapshot, suggest equally sized groups and download a private Excel workbook. Only confirmed, guardian-verified registrations can appear. The workbook never becomes a public URL.</p>
  <Notices loading={handoffs.loading||plans.loading} error={handoffs.error||plans.error||notice.error} success={notice.notice}/>
  <h3>Media handovers</h3>
  {!handoffs.data.length?<Empty>No handovers received yet.</Empty>:<div className="record-list">{handoffs.data.map(h=><article key={h.id} className="record-card">
   <div className="record-top"><strong>{events.find(e=>e.id===h.event_id)?.title??'Event'}</strong><span>{h.status}</span></div>
   <div className="record-meta"><span>{h.registered_count} registrations</span><span>{h.confirmed_count} confirmed</span><span>{h.notes||'No note'}</span></div>
   {manager&&<div className="record-actions">{(['reviewing','approved','returned'] as const).map(s=><button key={s} type="button" className="secondary-button" onClick={()=>void notice.run(async()=>{await mutation('v14_review_handoff',{p_id:h.id,p_status:s,p_notes:h.notes??''});await handoffs.refresh();},`Marked ${s}`)}>{s==='approved'?'Approve':s==='returned'?'Return':'Review'}</button>)}</div>}
   <button className="secondary-button" type="button" onClick={()=>setEventId(h.event_id)}>Prepare groups</button>
  </article>)}</div>}
  <h3>Group planner</h3>
  <div className="form-grid">
   <Field label="Event"><select value={eventId} onChange={e=>{setEventId(e.target.value);setCandidates([]);setAssignments({});}}><option value="">Select an event</option>{events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></Field>
   <Field label="Number of groups"><input type="number" min={1} max={40} value={count} onChange={e=>setCount(Math.max(1,Math.min(40,Number(e.target.value)||1)))}/></Field>
   <Field label="Plan name"><input value={planName} onChange={e=>setPlanName(e.target.value)} maxLength={120}/></Field>
  </div>
  <div className="record-actions"><button type="button" disabled={!eventId||notice.busy} onClick={()=>void notice.run(load,'Eligible participants loaded')}>Load eligible participants</button>
   <button className="secondary-button" type="button" disabled={!candidates.length} onClick={generate}>Balance groups evenly</button>
   <button className="secondary-button" type="button" disabled={!candidates.length} onClick={exportData}>Download private Excel (.xlsx)</button></div>
  <p className="hint">Eligible confirmed participants: {candidates.length}. A count of zero is expected until a verified registration process exists.</p>
  {candidates.length>0&&<div className="v14-scroll"><table className="v14-table"><thead><tr><th>Participant</th><th>Group</th></tr></thead><tbody>{candidates.map(c=><tr key={c.registration_id}><td>{c.participant_name}</td><td><select aria-label={`Group for ${c.participant_name}`} value={assignments[c.registration_id]??1} onChange={e=>setAssignments(v=>({...v,[c.registration_id]:Number(e.target.value)}))}>{Array.from({length:count},(_,i)=><option key={i} value={i+1}>Group {i+1}</option>)}</select></td></tr>)}</tbody></table></div>}
  <div className="record-actions"><button disabled={!eventId||!planName.trim()||notice.busy} onClick={()=>void notice.run(save,'Group plan saved for review')}>Save group plan</button></div>
  <h3>Group approvals</h3>
  <div className="record-list">{plans.data.map(p=><article key={p.id} className="record-card"><div className="record-top"><strong>{p.title}</strong><span>{p.status}</span></div><p>{p.group_count} groups · {p.assignments?.length??0} members</p>{manager&&p.status==='draft'&&<button type="button" onClick={()=>void notice.run(async()=>{await mutation('v14_approve_group_plan',{p_id:p.id});await plans.refresh();},'Group plan approved')}>Approve plan</button>}</article>)}</div>
 </section>;
}
