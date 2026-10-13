import { useEffect, useState } from 'react';
import { db } from '../supabase-portal';
import type {OrganizerAccess} from '../supabase-portal';
import { useRecords, Notices,Empty,Status,deptLabels } from './common';
import {readableDate,type Task,type PortalEvent,type KnowledgeDoc,type Audit} from '../portal-data';

export function Overview({access}:{access:OrganizerAccess}) {
 const tasks=useRecords<Task>('tasks','id,title,status,department,assignee_id,due_at');
 const events=useRecords<PortalEvent>('portal_events','id,title,department,starts_at,ends_at,status');
 const [organizerCount,setOrganizerCount]=useState<number|null>(null);
 useEffect(()=>{let active=true;void db.from('organizers').select('*',{count:'exact',head:true}).then(({count,error}: {count:number|null;error:unknown})=>{if(active&&!error)setOrganizerCount(count);});return()=>{active=false;}},[]);
 const outstanding=tasks.data.filter(t=>t.status!=='done');
 const upcoming=events.data.filter(e=>e.status!=='cancelled'&&new Date(e.starts_at)>new Date()).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
 return <section className="module-section">
  <p className="section-lead">You're signed into the verified Study0SG workspace. Data below comes from Supabase—not a demo counter.</p>
  <Notices loading={tasks.loading||events.loading} error={tasks.error||events.error}/>
  <div className="metric-row"><div className="metric"><span>Accessible open tasks</span><strong>{outstanding.length}</strong></div>
    <div className="metric"><span>Upcoming events</span><strong>{upcoming.length}</strong></div><div className="metric"><span>Visible organizer profiles</span><strong>{organizerCount??'—'}</strong></div>
  </div>
  <div className="dashboard-stats"><div><strong>Account</strong><span>Active & linked</span></div><div><strong>Roles</strong><span>{Array.from(new Set(access.roles)).join(', ')}</span></div>
    <div><strong>Departments</strong><span>{access.grants.map(g=>g.department).filter(Boolean).map(g=>deptLabels[g as keyof typeof deptLabels]??g).join(', ')||'All departments'}</span></div></div>
  <h2>Next events</h2>
  {!upcoming.length?<Empty>There are no upcoming events in your view.</Empty>:<div className="record-list">{upcoming.slice(0,3).map(event=><div className="record-card" key={event.id}><strong>{event.title}</strong> <Status value={event.status}/><p>{readableDate(event.starts_at)}</p></div>)}</div>}
  <h2>Open work</h2>
  {!outstanding.length?<Empty>No outstanding tasks in your permitted departments.</Empty>:<div className="record-list">{outstanding.slice(0,5).map(task=><div className="record-card" key={task.id}><strong>{task.title}</strong> <Status value={task.status}/></div>)}</div>}
 </section>;
}

export function Training(){const resources=useRecords<{id:string;title:string;department:string;mime_type:string}>('course_resources','id,title,department,mime_type');
 return <section className="module-section"><p className="section-lead">Browse approved training resource references available to your assigned departments. Google Drive streaming still requires the planned service-account viewer endpoint.</p><Notices loading={resources.loading} error={resources.error}/>
 {!resources.data.length&&!resources.loading?<Empty>No approved training resources are available yet.</Empty>:<div className="record-list">{resources.data.map(r=><div className="record-card" key={r.id}><strong>{r.title}</strong><div className="record-meta"><span>{r.department}</span><span>{r.mime_type}</span></div></div>)}</div>}</section>;
}
export function SecurityLogs(){const logs=useRecords<Audit>('audit_logs','id,actor_id,event_code,severity,outcome,created_at');return <section className="module-section"><p className="section-lead">Read-only audited activity. Admins cannot edit or delete audit logs.</p><Notices loading={logs.loading} error={logs.error}/>
 {!logs.data.length&&!logs.loading?<Empty>No accessible audit events.</Empty>:<div className="record-list">{logs.data.sort((a,b)=>b.id-a.id).slice(0,50).map(a=><article key={a.id} className="record-card"><div className="record-top"><strong>{a.event_code.replaceAll('.',' · ')}</strong><Status value={a.severity}/></div><div className="record-meta"><span>{a.outcome}</span><span>{readableDate(a.created_at)}</span></div></article>)}</div>}</section>}
