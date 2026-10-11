import {useState} from 'react';
import {mutation,grantRoles,type Application,type Department} from '../portal-data';
import {useRecords,useNotice,Notices,Empty,Status,Field,deptLabels} from './common';

export function Applications(){
  const list=useRecords<Application>('applications','id,display_name,email,biography,preferred_departments,status,email_verified_at');
  const action=useNotice();
  const [role,setRole]=useState('community_crew');const[department,setDepartment]=useState<Department>('community');
  return <section className="module-section"><p className="section-lead">Review applicants with an independently verified email. Elevated roles may require two different reviewers.</p>
    <Notices loading={list.loading} error={list.error||action.error} success={action.notice}/>
    <div className="form-grid two-cols"><Field label="Approved role"><select value={role} onChange={e=>setRole(e.target.value)}>{grantRoles.map(v=><option key={v} value={v}>{v}</option>)}</select></Field>
    <Field label="Review department"><select value={department} onChange={e=>setDepartment(e.target.value as Department)}>{['executive','support','community','media','technology','education'].map(v=><option key={v}>{v}</option>)}</select></Field></div>
    <div className="list-head"><strong>Volunteer applications</strong><button type="button" className="secondary-button" onClick={()=>void list.refresh()}>Refresh</button></div>
    {!list.data.length&&!list.loading?<Empty>No applications in your review scope.</Empty>:<div className="record-list">{list.data.map(a=><article className="record-card" key={a.id}>
      <div className="record-top"><strong>{a.display_name}</strong><Status value={a.status}/></div>
      <p>{a.email}</p><p>{a.biography}</p>
      <div className="record-meta"><span>{a.preferred_departments.map(d=>deptLabels[d]).join(', ')}</span><span>Email: {a.email_verified_at?'verified':'not verified'}</span></div>
      {['pending','reviewing'].includes(a.status)&&<div className="record-actions">
        <button disabled={action.busy||!a.email_verified_at} onClick={()=>void action.run(async()=>{
          await mutation('approve_application',{p_id:a.id,p_role:role,p_department:department});await list.refresh();
        },'Approval recorded. Check whether a second reviewer is required.')}>Approve & prepare invitation</button>
        <button className="danger-button" disabled={action.busy} onClick={()=>{
          if(window.confirm(`Decline ${a.display_name}'s application?`))void action.run(async()=>{await mutation('portal_application_decline',{p_id:a.id});await list.refresh();},'Application declined');
        }}>Decline</button>
      </div>}
    </article>)}</div>}
  </section>;
}
