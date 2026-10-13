import { useEffect, useState } from 'react';
import { mutation, permitsManager, departments, readableDate, type Department, type Organizer, type Task } from '../portal-data';
import { getPortalToken } from '../supabase-portal';
import { useRecords, useNotice, Notices, Field, Status, Empty, deptLabels } from './common';

type Props={actorId:string;grants:Array<{role:string;department:string|null}>;mineOnly?:boolean;department?:Department};
export function Tasks({actorId,grants,mineOnly=false,department}:Props){
  const listing=useRecords<Task>('tasks','id,title,description,department,assignee_id,status,due_at,archived_at');
  const people=useRecords<Organizer>('organizers','id,display_name,email,status,primary_department');
  const sessions=useRecords<{id:string;organizer_id:string;source_ref:string;state:string}>('service_sessions','id,organizer_id,source_ref,state');
  const action=useNotice();
  const managerDepartments=departments.filter(d=>permitsManager(grants,d));
  const [editing,setEditing]=useState<string|null>(null);
  const [dept,setDept]=useState<Department>(department??managerDepartments[0]??'support');
  const [title,setTitle]=useState('');const [description,setDescription]=useState('');
  const [assignee,setAssignee]=useState('');const [due,setDue]=useState('');const [status,setStatus]=useState('todo');
  const [progressNotes,setProgressNotes]=useState<Record<string,string>>({});
  useEffect(()=>{if(department)setDept(department);},[department]);
  const canWrite=managerDepartments.length>0&&(department?managerDepartments.includes(department):true);
  const recordSession=async(actionName:'start'|'finish',taskId:string,sessionId?:string)=>{
    const token=getPortalToken();if(!token)throw new Error('Session expired; please sign in again');
    const res=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/service-task-session`,{
      method:'POST',headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`},
      body:JSON.stringify(actionName==='start'?{action:'start',task_id:taskId}:{action:'finish',session_id:sessionId})
    });
    const body=await res.json().catch(()=>null) as {error?:string}|null;
    if(!res.ok)throw new Error(body?.error||`Session recording failed (${res.status})`);
    await sessions.refresh();
    // Only meaningful task events are recorded; no browsing/keyboard telemetry.
    await mutation('v20_log_work_action',{p_task:taskId,p_action:actionName==='start'?'work_started':'work_finished',p_detail:actionName==='start'?'Organizer started a work session':'Organizer completed session; minutes await review'});
  };
  const list=listing.data.filter(t=>!t.archived_at&&(!mineOnly||t.assignee_id===actorId)&&(!department||t.department===department));
  const clear=()=>{setEditing(null);setTitle('');setDescription('');setAssignee('');setDue('');setStatus('todo');};
  const edit=(t:Task)=>{setEditing(t.id);setDept(t.department);setTitle(t.title);setDescription(t.description||'');setAssignee(t.assignee_id||'');setStatus(t.status);setDue(t.due_at?t.due_at.slice(0,16):'');};
  const save=async()=>{
    const payload={p_title:title,p_description:description,p_assignee_id:assignee||null,p_due_at:due?new Date(due).toISOString():null};
    const ok=await action.run(async()=>{if(editing)await mutation('portal_task_update',{p_id:editing,...payload,p_status:status});
      else await mutation('portal_task_create',{p_department:dept,...payload});},editing?'Task updated':'Task created');
    if(ok){clear();await listing.refresh();}
  };
  return <section className="module-section">
    <p className="section-lead">Assign work, track real task actions and preserve evidence for your VIA reviewer. Background browser time is not counted as volunteering.</p>
    <Notices loading={listing.loading} error={listing.error||people.error||sessions.error||action.error} success={action.notice}/>
    {canWrite&&<details className="editor-box" open={!!editing} key={editing??'create'}><summary>{editing?'Edit task':'+ Create task'}</summary>
      <form onSubmit={e=>{e.preventDefault();void save();}} className="form-grid">
        <Field label="Department"><select value={dept} onChange={e=>setDept(e.target.value as Department)} disabled={!!editing||!!department}>{(department?[department]:managerDepartments).map(d=><option key={d} value={d}>{deptLabels[d]}</option>)}</select></Field>
        <Field label="Task title"><input required minLength={3} maxLength={200} value={title} onChange={e=>setTitle(e.target.value)}/></Field>
        <Field label="Assigned volunteer"><select value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Unassigned</option>{people.data.filter(p=>p.status==='active').map(p=><option value={p.id} key={p.id}>{p.display_name}</option>)}</select></Field>
        <Field label="Due date (optional)"><input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></Field>
        {editing&&<Field label="Status"><select value={status} onChange={e=>setStatus(e.target.value)}>{['todo','doing','blocked','done'].map(v=><option key={v}>{v}</option>)}</select></Field>}
        <Field label="Description"><textarea maxLength={4000} rows={3} value={description} onChange={e=>setDescription(e.target.value)}/></Field>
        <div className="form-actions"><button disabled={action.busy} type="submit">{action.busy?'Saving…':editing?'Save changes':'Create task'}</button>{editing&&<button type="button" className="secondary-button" onClick={clear}>Cancel edit</button>}</div>
      </form></details>}
    <div className="list-head"><strong>{mineOnly?'My assigned tasks':'Department tasks'}</strong><button type="button" className="secondary-button" onClick={()=>void listing.refresh()}>Refresh</button></div>
    {!list.length&&!listing.loading?<Empty>No active tasks are visible to your account.</Empty>:<div className="record-list">{list.map(t=>{
      const canManage=permitsManager(grants,t.department);
      const activeSession=sessions.data.find(s=>s.organizer_id===actorId&&s.source_ref===t.id&&s.state==='active');
      return <article className="record-card" key={t.id}>
        <div className="record-top"><strong>{t.title}</strong><Status value={t.status}/></div>
        <p>{t.description||'No task description yet.'}</p>
        <div className="record-meta"><span>{deptLabels[t.department]}</span><span>{people.data.find(p=>p.id===t.assignee_id)?.display_name||'Unassigned'}</span><span>Due: {readableDate(t.due_at)}</span></div>
        <div className="record-actions">{(canManage||t.assignee_id===actorId)&&<Field label="Change status"><select aria-label={`Status for ${t.title}`} value={t.status} onChange={e=>void action.run(async()=>{await mutation('portal_task_set_status',{p_id:t.id,p_status:e.target.value});await mutation('v20_log_work_action',{p_task:t.id,p_action:'status_updated',p_detail:`Status changed to ${e.target.value}`});await listing.refresh();},'Task status saved')}>
          {['todo','doing','blocked','done'].map(v=><option value={v} key={v}>{v}</option>)}</select></Field>}
          {t.assignee_id===actorId&&t.status==='doing'&&!activeSession&&<button type="button" className="secondary-button" disabled={action.busy} onClick={()=>void action.run(()=>recordSession('start',t.id),'Work session started. Finish the task to submit candidate minutes.')}>Start work session</button>}
          {t.assignee_id===actorId&&t.status==='done'&&activeSession&&<button type="button" disabled={action.busy} onClick={()=>void action.run(()=>recordSession('finish',t.id,activeSession.id),'Candidate contribution created; reviewer approval is still required.')}>Finish session & request hours</button>}
          {(canManage||t.assignee_id===actorId)&&<div className="task-progress-log"><label className="hint">Real work update (not browser surveillance)<textarea rows={2} maxLength={500} placeholder="What did you complete? Add a brief note for your VIA evidence." value={progressNotes[t.id]??''} onChange={e=>setProgressNotes(v=>({...v,[t.id]:e.target.value}))}/></label><button type="button" className="secondary-button" disabled={action.busy||(progressNotes[t.id]??'').trim().length<5} onClick={()=>void action.run(async()=>{await mutation('v20_log_work_action',{p_task:t.id,p_action:'progress_note',p_detail:(progressNotes[t.id]??'').trim()});setProgressNotes(v=>({...v,[t.id]:''}));},'Work activity recorded for later review')}>Log progress</button></div>}
          {canManage&&<><button type="button" className="secondary-button" onClick={()=>edit(t)}>Edit</button><button type="button" className="danger-button" onClick={()=>{if(window.confirm('Archive this task? Existing evidence and history will be preserved.'))void action.run(async()=>{await mutation('portal_task_archive',{p_id:t.id});await listing.refresh();},'Task archived');}}>Archive</button></>}
        </div></article>})}</div>}
  </section>;
}
