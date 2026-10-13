import {useState,useEffect} from 'react';
import {departments,mutation,permitsManager,readableDate,type Department,type PortalEvent} from '../portal-data';
import {useRecords,useNotice,Notices,Field,Empty,Status,deptLabels} from './common';

type Props={grants:Array<{role:string;department:string|null}>;department?:Department};
export function Events({grants,department}:Props){
  const listing=useRecords<PortalEvent>('portal_events','id,department,title,description,starts_at,ends_at,venue,status');
  const action=useNotice();const managerDepartments=departments.filter(d=>permitsManager(grants,d));
  const [edit,setEdit]=useState<string|null>(null);const[dept,setDept]=useState<Department>(department??managerDepartments[0]??'community');
  const[title,setTitle]=useState('');const[description,setDescription]=useState('');const[venue,setVenue]=useState('');
  const[start,setStart]=useState('');const[end,setEnd]=useState('');const[status,setStatus]=useState('draft');
  useEffect(()=>{if(department)setDept(department)},[department]);
  const clear=()=>{setEdit(null);setTitle('');setDescription('');setVenue('');setStart('');setEnd('');setStatus('draft');};
  const choose=(event:PortalEvent)=>{setEdit(event.id);setDept(event.department);setTitle(event.title);setDescription(event.description);setVenue(event.venue);setStart(event.starts_at.slice(0,16));setEnd(event.ends_at.slice(0,16));setStatus(event.status);};
  const save=async()=>{
    const data={p_title:title,p_description:description,p_starts_at:new Date(start).toISOString(),p_ends_at:new Date(end).toISOString(),p_venue:venue,p_status:status};
    const ok=await action.run(async()=>{if(edit)await mutation('portal_event_update',{p_id:edit,...data});else await mutation('portal_event_create',{p_department:dept,...data});await listing.refresh();},edit?'Event updated':'Event created');
    if(ok)clear();
  };
  const list=listing.data.filter(e=>!department||e.department===department);
  const canWrite=managerDepartments.length>0&&(department?managerDepartments.includes(department):true);
  return <section className="module-section"><p className="section-lead">Plan, publish, and cancel events. These internal records do not automatically publish to the public Astro website.</p>
    <Notices loading={listing.loading} error={listing.error||action.error} success={action.notice}/>
    {canWrite&&<details className="editor-box" open={!!edit} key={edit??'new'}><summary>{edit?'Edit event':'+ Create event'}</summary>
      <form className="form-grid" onSubmit={e=>{e.preventDefault();void save();}}>
        <Field label="Department"><select value={dept} onChange={e=>setDept(e.target.value as Department)} disabled={!!edit||!!department}>{(department?[department]:managerDepartments).map(d=><option value={d} key={d}>{deptLabels[d]}</option>)}</select></Field>
        <Field label="Event name"><input required minLength={3} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
        <Field label="Starts"><input required type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></Field>
        <Field label="Ends"><input required type="datetime-local" min={start||undefined} value={end} onChange={e=>setEnd(e.target.value)}/></Field>
        <Field label="Venue / online link"><input maxLength={160} value={venue} onChange={e=>setVenue(e.target.value)}/></Field>
        <Field label="Visibility"><select value={status} onChange={e=>setStatus(e.target.value)}><option value="draft">Draft</option><option value="published">Published (internal)</option></select></Field>
        <Field label="Description"><textarea rows={3} maxLength={3000} value={description} onChange={e=>setDescription(e.target.value)}/></Field>
        <div className="form-actions"><button disabled={action.busy}>{edit?'Save event':'Create event'}</button>{edit&&<button className="secondary-button" type="button" onClick={clear}>Cancel edit</button>}</div>
      </form></details>}
    <div className="list-head"><strong>Upcoming and previous events</strong><button type="button" className="secondary-button" onClick={()=>void listing.refresh()}>Refresh</button></div>
    {!list.length&&!listing.loading?<Empty>No events have been added yet.</Empty>:<div className="record-list">{list.sort((a,b)=>a.starts_at.localeCompare(b.starts_at)).map(event=><article key={event.id} className="record-card">
      <div className="record-top"><strong>{event.title}</strong><Status value={event.status}/></div>
      <p>{event.description||'No description.'}</p><div className="record-meta"><span>{deptLabels[event.department]}</span><span>{readableDate(event.starts_at)} to {readableDate(event.ends_at)}</span><span>{event.venue||'Location TBC'}</span></div>
      {permitsManager(grants,event.department)&&event.status!=='cancelled'&&<div className="record-actions"><button className="secondary-button" type="button" onClick={()=>choose(event)}>Edit</button>
        <button type="button" className="danger-button" onClick={()=>{
          if(window.confirm('Cancel this event? The record stays in the audit history.'))void action.run(async()=>{await mutation('portal_event_cancel',{p_id:event.id});await listing.refresh();},'Event cancelled');
        }}>Cancel event</button></div>}
    </article>)}</div>}
  </section>;
}
