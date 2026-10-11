import {useEffect,useState} from 'react';
import {mutation,type Organizer} from '../portal-data';
import {useRecords,useNotice,Notices,Field} from './common';
export function Profile({actorId}:{actorId:string}){
  const people=useRecords<Organizer>('organizers','id,display_name,email,status,primary_department,private_bio,public_bio');
  const action=useNotice();const actor=people.data.find(p=>p.id===actorId);
  const [bio,setBio]=useState('');const [publicBio,setPublicBio]=useState('');
  useEffect(()=>{if(actor){setBio(actor.private_bio||'');setPublicBio(actor.public_bio||'');}},[actor?.id,actor?.private_bio,actor?.public_bio]);
  return <section className="module-section"><p className="section-lead">Your personal profile. Name, email, identity, department and roles are managed separately by an authorized Fore Director.</p>
    <Notices loading={people.loading} error={people.error||action.error} success={action.notice}/>
    {actor&&<><p><strong>{actor.display_name}</strong> · {actor.email}</p>
      <form className="form-grid" onSubmit={e=>{e.preventDefault();void action.run(async()=>{await mutation('portal_profile_update',{p_bio:bio,p_public_bio:publicBio});await people.refresh();},'Profile saved');}}>
      <Field label="Internal biography"><textarea maxLength={2000} value={bio} rows={4} onChange={e=>setBio(e.target.value)}/></Field>
      <Field label="Public team-card biography draft"><textarea maxLength={300} rows={3} value={publicBio} onChange={e=>setPublicBio(e.target.value)}/></Field>
      <button disabled={action.busy}>Save profile</button></form>
      <p className="hint">Editing the public biography does not automatically publish a card or override your consent settings.</p></>}
  </section>;
}
