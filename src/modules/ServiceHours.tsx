import {useState} from 'react';
import {db,getPortalToken} from '../supabase-portal';
import {mutation,readableDate,type Claim,type Entry,type Organizer,type Department} from '../portal-data';
import {useRecords,useNotice,Notices,Empty,Status,Field,deptLabels} from './common';

type Grant={role:string;department:string|null};
type ViaClaim=Claim & {work_summary?:string|null;drafted_letter?:string|null;evidence_url?:string|null};
const deptList:Department[]=['executive','support','community','media','technology','education'];

export function ServiceHours({actorId,grants}:{actorId:string;grants:Grant[]}){
  const claims=useRecords<ViaClaim>('service_claims','id,organizer_id,department,activity_label,candidate_minutes,approved_minutes,potential_via,status,created_at,work_summary,drafted_letter,evidence_url');
  const ledger=useRecords<Entry>('service_entries','id,organizer_id,minutes_delta,entry_type,created_at');
  const people=useRecords<Organizer>('organizers','id,display_name,email,status,primary_department');
  const action=useNotice();
  const isFore=grants.some(g=>g.role==='fore_director');
  const directorDepts=grants.filter(g=>g.role==='director'&&g.department).map(g=>g.department as Department);
  const [reviewNote,setReviewNote]=useState('Reviewed supporting evidence and completed work summary');
  const [approvedMinutes,setApprovedMinutes]=useState<Record<string,number>>({});
  const [editing,setEditing]=useState<string|null>(null),[owner,setOwner]=useState(actorId);
  const [department,setDepartment]=useState<Department>(directorDepts[0]??'support');
  const [title,setTitle]=useState(''),[summary,setSummary]=useState(''),[minutes,setMinutes]=useState(30),[letter,setLetter]=useState(''),[evidence,setEvidence]=useState(''),[potential,setPotential]=useState(true);
  const [draftBusy,setDraftBusy]=useState(false),[draftError,setDraftError]=useState('');
  const [displayActivity,setDisplayActivity]=useState(false);
  const activity=useRecords<{id:string;organizer_id:string;task_id:string;action:string;detail:string;created_at:string}>('work_activity_events','id,organizer_id,task_id,action,detail,created_at');
  const myTotal=ledger.data.filter(e=>e.organizer_id===actorId).reduce((n,e)=>n+e.minutes_delta,0);
  const canReview=(c:ViaClaim)=>isFore&&c.organizer_id!==actorId;
  const reset=()=>{setEditing(null);setOwner(actorId);setTitle('');setSummary('');setMinutes(30);setLetter('');setEvidence('');setPotential(true);setDraftError('');};
  const editClaim=(c:ViaClaim)=>{setEditing(c.id);setOwner(c.organizer_id);setDepartment(c.department);setTitle(c.activity_label);setSummary(c.work_summary??'');setMinutes(c.candidate_minutes);setLetter(c.drafted_letter??'');setEvidence(c.evidence_url??'');setPotential(c.potential_via);};
  const canEdit=(c:ViaClaim)=>c.status==='pending' && (c.organizer_id===actorId||isFore||directorDepts.includes(c.department));
  const submit=async()=>{const id=await mutation<string>('v20_via_upsert',{
    p_claim:editing,p_organizer:owner,p_department:department,p_title:title,p_minutes:minutes,
    p_summary:summary,p_letter:letter,p_evidence_url:evidence||null,p_potential_via:potential});
    reset();await claims.refresh();return id;};
  const draftLetter=async()=>{const token=getPortalToken();if(!token){setDraftError('Sign in again');return;}
    setDraftBusy(true);setDraftError('');try{const res=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/via-letter`,{
      method:'POST',headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`},
      body:JSON.stringify({title,summary,minutes,department})});
      const json=await res.json().catch(()=>({})) as {draft?:string;error?:string};
      if(!res.ok||!json.draft)throw Error(json.error||'Could not draft letter');setLetter(json.draft);
    }catch(e){setDraftError(e instanceof Error?e.message:'Draft failed');}finally{setDraftBusy(false);}};
  const review=async(c:ViaClaim,decision:'approve'|'reject')=>{
    const token=getPortalToken();if(!token)throw Error('Portal session expired');
    const res=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/service-claim-review`,{
      method:'POST',headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`},
      body:JSON.stringify({claim_id:c.id,decision,minutes:decision==='approve'?(approvedMinutes[c.id]??c.candidate_minutes):null,
       reason:reviewNote,idempotency_key:crypto.randomUUID(),potential_via:c.potential_via})});
    const json=await res.json().catch(()=>({})) as {error?:string};if(!res.ok)throw Error(json.error||`Review failed (${res.status})`);
    await Promise.all([claims.refresh(),ledger.refresh()]);
  };
  const internalStatement=()=>{
    const approved=claims.data.filter(c=>c.organizer_id===actorId&&c.status==='approved');
    const lines=[`Study0SG — INTERNAL CONTRIBUTION SUMMARY (NOT SINGPASS VERIFIED)`,`Prepared: ${new Date().toLocaleDateString('en-SG')}`,
      `Organizer: ${people.data.find(x=>x.id===actorId)?.display_name??'Current organizer'}`,
      `Verified service ledger total: ${Math.max(0,myTotal/60).toFixed(2)} hours`,'',
      ...approved.map(c=>`${c.activity_label} — ${c.approved_minutes??0} minutes, ${deptLabels[c.department]}, ${readableDate(c.created_at)}`),'',
      'This draft summarizes Study0SG internal records only. School VIA/LEAPS recognition and Singpass verification are NOT asserted.'];
    const blob=new Blob([lines.join('\n')],{type:'text/plain'}),url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download='Study0SG-internal-contribution-summary.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  return <section className="module-section via-workspace">
   <div className="via-intro"><span className="eyebrow">MY CONTRIBUTIONS</span><h2>Record meaningful work, then request verified hours.</h2><p>Only actual task actions and evidence count as supporting records. Time spent just keeping a browser tab open does not earn VIA credit.</p></div>
   <Notices loading={claims.loading||ledger.loading} error={claims.error||ledger.error||people.error||action.error} success={action.notice}/>
   <div className="metric-row"><div className="metric"><span>My approved contribution hours</span><strong>{Math.max(0,myTotal/60).toFixed(2)}h</strong></div><div className="metric"><span>My pending work reports</span><strong>{claims.data.filter(c=>c.organizer_id===actorId&&c.status==='pending').length}</strong></div><div className="metric"><span>Meaningful activity events</span><strong>{activity.data.filter(x=>x.organizer_id===actorId).length}</strong></div></div>
   <details className="editor-box" open={!!editing} key={editing??'via-new'}><summary>{editing?'Edit an unapproved work report':'+ Record an activity or work report'}</summary>
    <p className="hint">Write what you achieved. Include a reviewed link or other evidence where available. An AI-assisted letter is a draft only, never an approval.</p>
    <form className="form-grid" onSubmit={e=>{e.preventDefault();void action.run(submit,editing?'Pending report updated':'Work report submitted for independent review');}}>
     {(isFore||directorDepts.length>0)&&<Field label="Organizer receiving candidate hours"><select value={owner} disabled={!!editing} onChange={e=>setOwner(e.target.value)}>{people.data.filter(p=>p.status==='active'&&(isFore||p.id===actorId||directorDepts.includes(p.primary_department))).map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select></Field>}
     <Field label="Department"><select value={department} disabled={!!editing} onChange={e=>setDepartment(e.target.value as Department)}>{deptList.filter(d=>isFore||directorDepts.includes(d)||(!directorDepts.length&&d===people.data.find(p=>p.id===actorId)?.primary_department)).map(d=><option key={d} value={d}>{deptLabels[d]}</option>)}</select></Field>
     <Field label="Activity / task title"><input required minLength={5} maxLength={200} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Prepared slides for the Primary 6 workshop"/></Field>
     <Field label="Minutes requested (not awarded automatically)"><input required type="number" min="1" max="480" value={minutes} onChange={e=>setMinutes(Number(e.target.value))}/></Field>
     <Field label="What did you do, and what was the outcome?"><textarea required minLength={20} maxLength={2500} rows={5} value={summary} onChange={e=>setSummary(e.target.value)} placeholder="Describe your own work in simple language, what changed, and any useful evidence…"/></Field>
     <Field label="Evidence URL (optional — use an approved link)"><input type="url" maxLength={700} value={evidence} onChange={e=>setEvidence(e.target.value)}/></Field>
     <label className="check-label"><input type="checkbox" checked={potential} onChange={e=>setPotential(e.target.checked)}/> Mark this as a possible VIA contribution for review</label>
     <div className="via-letter"><div className="record-actions"><strong>Formal activity letter draft</strong><button type="button" className="secondary-button" disabled={draftBusy||summary.trim().length<20||title.trim().length<5} onClick={()=>void draftLetter()}>{draftBusy?'Drafting…':'✦ AI draft (up to 5/day)'}</button></div>
      <Field label="Edit this draft before submitting"><textarea rows={7} maxLength={5000} value={letter} onChange={e=>setLetter(e.target.value)} placeholder="Use AI to prepare an editable formal draft, or write your own. No signatures, school recognition or approval is implied."/></Field>{draftError&&<p className="error-alert" role="alert">{draftError}</p>}</div>
     <div className="form-actions"><button type="submit" disabled={action.busy||summary.trim().length<20}>{action.busy?'Saving…':'Submit pending report'}</button><button type="button" className="secondary-button" onClick={reset}>Clear form</button></div>
    </form>
   </details>
   {isFore&&<div className="editor-box"><strong>Fore Director approval queue</strong><p className="hint">Only a Fore Director may approve or reject. Self-approval is forbidden; a different Fore Director must review your own contribution.</p><Field label="Reason for approval or rejection"><textarea minLength={4} rows={2} maxLength={1000} value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/></Field></div>}
   <div className="list-head"><strong>Activity reports & claim history</strong><button type="button" className="secondary-button" onClick={()=>void Promise.all([claims.refresh(),ledger.refresh(),activity.refresh()])}>Refresh</button></div>
   {!claims.data.length&&!claims.loading?<Empty>No report yet. Start by describing a real contribution above.</Empty>:<div className="record-list">{claims.data.map(c=><article key={c.id} className="record-card">
    <div className="record-top"><strong>{c.activity_label}</strong><Status value={c.status}/></div><div className="record-meta"><span>{people.data.find(p=>p.id===c.organizer_id)?.display_name??'Organizer'}</span><span>{deptLabels[c.department]}</span><span>Requested {c.candidate_minutes} min</span><span>{readableDate(c.created_at)}</span></div>
    {!!c.work_summary&&<p>{c.work_summary}</p>}{c.evidence_url&&<p className="hint">Evidence link provided (review URL before opening)</p>}
    {c.status==='approved'&&<p>Independently approved: <strong>{c.approved_minutes} minutes</strong></p>}
    {c.drafted_letter&&<details><summary>View proposed activity letter</summary><pre className="via-draft-preview">{c.drafted_letter}</pre></details>}
    <div className="record-actions">{canEdit(c)&&<button className="secondary-button" onClick={()=>editClaim(c)}>Edit pending report</button>}
     {c.status==='pending'&&canReview(c)&&<><Field label="Minutes to approve"><input type="number" min="1" max={c.candidate_minutes} value={approvedMinutes[c.id]??c.candidate_minutes} onChange={e=>setApprovedMinutes(v=>({...v,[c.id]:Number(e.target.value)}))}/></Field><button disabled={action.busy||reviewNote.trim().length<4} onClick={()=>void action.run(()=>review(c,'approve'),'Approved and entered in ledger')}>Approve</button><button className="danger-button" disabled={action.busy||reviewNote.trim().length<4} onClick={()=>void action.run(()=>review(c,'reject'),'Claim rejected')}>Reject</button></>}
    </div>
   </article>)}</div>}
   <details className="editor-box" open={displayActivity} onToggle={e=>setDisplayActivity((e.currentTarget as HTMLDetailsElement).open)}><summary>Show meaningful work activity history</summary><p className="hint">Recorded from actual task changes and session actions only. These records help with review but are not proof of continuous attendance.</p><div className="record-list">{activity.data.slice().sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,100).map(x=><div className="record-card" key={x.id}><strong>{x.action.replaceAll('_',' ')}</strong><span> · {readableDate(x.created_at)}</span><p>{x.detail}</p></div>)}</div></details>
   <div className="editor-box"><strong>Contribution statement / school evidence</strong><p>This version can export an <em>internal, unverified summary</em> of approved hours. It cannot claim Singpass verification, automatically certify LEAPS 2.0, or award school credit.</p><div className="record-actions"><button type="button" onClick={internalStatement}>Download internal summary (TXT)</button><button type="button" disabled title="Requires approved Singpass/NDI integration and independent identity verification">Singpass-verified transcript — integration pending</button></div></div>
  </section>;
}
