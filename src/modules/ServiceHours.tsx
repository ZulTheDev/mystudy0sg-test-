import {useState} from 'react';
import {readableDate,permitsManager,type Claim,type Entry} from '../portal-data';
import {useRecords,useNotice,Notices,Empty,Status,Field,deptLabels} from './common';
import {getPortalToken} from '../supabase-portal';

export function ServiceHours({actorId,grants}:{actorId:string;grants:Array<{role:string;department:string|null}>}){
  const claims=useRecords<Claim>('service_claims','id,organizer_id,department,activity_label,candidate_minutes,approved_minutes,potential_via,status,created_at');
  const ledger=useRecords<Entry>('service_entries','id,organizer_id,minutes_delta,entry_type,created_at');
  const action=useNotice();const[reason,setReason]=useState('Verified against task evidence and attendance');
  const [minutes,setMinutes]=useState<Record<string,number>>({});
  const myTotal=ledger.data.filter(e=>e.organizer_id===actorId).reduce((n,e)=>n+e.minutes_delta,0);
  const canReview=(c:Claim)=>c.organizer_id!==actorId&&permitsManager(grants,c.department);
  const submitReview=async(c:Claim,decision:'approve'|'reject')=>{
    const token=getPortalToken();if(!token)throw new Error('Portal session expired');
    const res=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/service-claim-review`,{
      method:'POST',headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`},
      body:JSON.stringify({claim_id:c.id,decision,minutes:decision==='approve'?(minutes[c.id]??c.candidate_minutes):null,
        reason,idempotency_key:crypto.randomUUID(),potential_via:c.potential_via})
    });
    const body=await res.json().catch(()=>null) as {error?:string}|null;
    if(!res.ok)throw new Error(body?.error||`Review failed (${res.status})`);
    await Promise.all([claims.refresh(),ledger.refresh()]);
  };
  return <section className="module-section">
    <p className="section-lead">Candidate contributions are not verified hours until a different authorized reviewer approves them.</p>
    <Notices loading={claims.loading||ledger.loading} error={claims.error||ledger.error||action.error} success={action.notice}/>
    <div className="metric-row"><div className="metric"><span>My verified contribution hours</span><strong>{Math.max(0,myTotal/60).toFixed(2)}h</strong></div>
      <div className="metric"><span>My pending claims</span><strong>{claims.data.filter(c=>c.organizer_id===actorId&&c.status==='pending').length}</strong></div>
    </div>
    <p className="hint">Study0SG verification is not automatic recognition under a school's VIA or LEAPS policies.</p>
    {claims.data.some(canReview)&&<Field label="Review note (required, minimum 4 characters)"><textarea rows={2} minLength={4} value={reason} onChange={e=>setReason(e.target.value)}/></Field>}
    <div className="list-head"><strong>Contribution claims</strong><button type="button" className="secondary-button" onClick={()=>void Promise.all([claims.refresh(),ledger.refresh()])}>Refresh</button></div>
    {!claims.data.length&&!claims.loading?<Empty>No evidence-backed claims yet. Time is never awarded merely for having the browser open.</Empty>:<div className="record-list">{claims.data.map(c=><article key={c.id} className="record-card">
      <div className="record-top"><strong>{c.activity_label}</strong><Status value={c.status}/></div>
      <div className="record-meta"><span>{deptLabels[c.department]}</span><span>Proposed {c.candidate_minutes} minutes</span><span>{readableDate(c.created_at)}</span></div>
      {c.status==='approved'&&<p>Approved: {c.approved_minutes} minutes</p>}
      {c.status==='pending'&&canReview(c)&&<div className="record-actions"><Field label="Approved minutes"><input type="number" min={1} max={480} value={minutes[c.id]??c.candidate_minutes} onChange={e=>setMinutes(v=>({...v,[c.id]:Number(e.target.value)}))}/></Field>
        <button disabled={action.busy||reason.trim().length<4} onClick={()=>void action.run(()=>submitReview(c,'approve'),'Contribution approved')}>Approve</button>
        <button className="danger-button" disabled={action.busy||reason.trim().length<4} onClick={()=>void action.run(()=>submitReview(c,'reject'),'Claim rejected')}>Reject</button>
      </div>}
    </article>)}</div>}
  </section>;
}
