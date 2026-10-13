import { useState } from 'react';
import { departments,grantRoles,mutation,type Department,type Organizer,type Grant, readableDate } from '../portal-data';
import {useRecords,useNotice,Notices,Field,Empty,Status,deptLabels} from './common';

export function People({actorId}:{actorId:string}){
  const people=useRecords<Organizer>('organizers','id,display_name,email,status,primary_department');
  const grants=useRecords<Grant>('organizer_grants','id,organizer_id,role,department,revoked_at');
  const action=useNotice();
  const [name,setName]=useState('');const[email,setEmail]=useState('');
  const[department,setDepartment]=useState<Department>('community');
  const[selected,setSelected]=useState<string|null>(null);
  const[updatedName,setUpdatedName]=useState('');const[updatedDepartment,setUpdatedDepartment]=useState<Department>('community');
  const[status,setStatus]=useState('invited');
  const[grantRole,setGrantRole]=useState('director');const[grantDept,setGrantDept]=useState<Department>('media');
  const reload=async()=>{await Promise.all([people.refresh(),grants.refresh()]);};
  const chosen=people.data.find(p=>p.id===selected);
  const select=(person:Organizer)=>{setSelected(person.id);setUpdatedName(person.display_name);setUpdatedDepartment(person.primary_department);setStatus(person.status);};
  return <section className="module-section">
    <p className="section-lead">Fore Director administration. New organizers remain <b>invited</b> until Stytch identity verification and activation are complete.</p>
    <Notices loading={people.loading||grants.loading} error={people.error||grants.error||action.error} success={action.notice}/>
    <details className="editor-box"><summary>+ Register organizer</summary>
      <form className="form-grid" onSubmit={e=>{e.preventDefault();void action.run(async()=>{
        await mutation('portal_organizer_create',{p_name:name,p_email:email,p_department:department});await reload();setName('');setEmail('');
      },'Organizer registered as invited. Send a Stytch invitation separately.');}}>
        <Field label="Name"><input required minLength={2} maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></Field>
        <Field label="Email"><input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></Field>
        <Field label="Primary department"><select value={department} onChange={e=>setDepartment(e.target.value as Department)}>{departments.map(d=><option value={d} key={d}>{deptLabels[d]}</option>)}</select></Field>
        <button disabled={action.busy}>Create invited organizer</button>
      </form></details>
    <div className="list-head"><strong>Organizer directory</strong><button className="secondary-button" type="button" onClick={()=>void reload()}>Refresh</button></div>
    {!people.data.length&&!people.loading?<Empty>No visible organizers.</Empty>:<div className="record-list">{people.data.map(p=><article className="record-card" key={p.id}>
      <div className="record-top"><strong>{p.display_name}</strong><Status value={p.status}/></div>
      <p>{p.email}</p><div className="record-meta"><span>{deptLabels[p.primary_department]}</span><span>{grants.data.filter(g=>g.organizer_id===p.id&&!g.revoked_at).map(g=>`${g.role} (${g.department||'global'})`).join(' · ')||'No grants'}</span></div>
      <button className="secondary-button" type="button" onClick={()=>select(p)}>Manage</button>
    </article>)}</div>}
    {chosen&&<section className="editor-box" aria-label="Edit selected organizer"><div className="record-top"><h2>Manage {chosen.display_name}</h2><button type="button" className="secondary-button" onClick={()=>setSelected(null)}>Close</button></div>
      <form className="form-grid" onSubmit={e=>{e.preventDefault();void action.run(async()=>{await mutation('portal_organizer_update',{p_id:chosen.id,p_name:updatedName,p_department:updatedDepartment,p_status:status});await reload();},'Organizer updated');}}>
        <Field label="Display name"><input required value={updatedName} minLength={2} maxLength={100} onChange={e=>setUpdatedName(e.target.value)}/></Field>
        <Field label="Primary department"><select value={updatedDepartment} onChange={e=>setUpdatedDepartment(e.target.value as Department)}>{departments.map(d=><option value={d} key={d}>{deptLabels[d]}</option>)}</select></Field>
        <Field label="Account status"><select value={status} onChange={e=>setStatus(e.target.value)} disabled={chosen.id===actorId}>
          {['invited','active','suspended'].filter(v=>v!=='invited'||chosen.status==='invited').map(v=><option key={v}>{v}</option>)}
        </select></Field>
        <div className="form-actions"><button disabled={action.busy}>Save organizer</button><span className="hint">Suspending access invalidates portal JWTs. Offboarding uses its own workflow.</span></div>
      </form>
      <h3>Department grants</h3>
      <div className="record-list">{grants.data.filter(g=>g.organizer_id===chosen.id&&!g.revoked_at).map(g=><div className="record-top record-inline" key={g.id}><span>{g.role} · {g.department||'Global'}</span>
        {g.role!=='fore_director'&&<button className="danger-button" type="button" disabled={action.busy} onClick={()=>{
          if(window.confirm(`Revoke ${g.role} for ${chosen.display_name}?`))void action.run(async()=>{await mutation('portal_grant_revoke',{p_grant_id:g.id});await reload();},'Grant revoked');
        }}>Revoke</button>}
      </div>)}</div>
      <form className="form-grid" onSubmit={e=>{e.preventDefault();void action.run(async()=>{
        await mutation('portal_grant_add',{p_organizer_id:chosen.id,p_role:grantRole,p_department:grantDept});await reload();},'Department grant added');}}>
        <Field label="Grant role"><select value={grantRole} onChange={e=>setGrantRole(e.target.value)}>{grantRoles.map(r=><option key={r} value={r}>{r}</option>)}</select></Field>
        <Field label="Department"><select value={grantDept} onChange={e=>setGrantDept(e.target.value as Department)}>{departments.filter(d=>d!=='executive').map(d=><option key={d}>{d}</option>)}</select></Field>
        <button disabled={action.busy}>Add department grant</button>
      </form>
      <p className="hint">Fore Director role creation/revocation requires a separate independently reviewed procedure. Grant changes are audited. Registered profiles require separate Stytch membership invitations.</p>
      <p className="hint">Profile last loaded: {readableDate(new Date().toISOString())}</p>
    </section>}
  </section>;
}
