import {useEffect,useState} from 'react';
import {MarketingTools} from './MarketingTools';
import {db} from '../supabase-portal';
import {mutation} from '../portal-data';
import {useRecords,useNotice,Notices,Field,Empty} from './common';
type Partner={id:string;name:string;organization:string;purpose:string;stage:string;source_url:string};
type Finance={id:string;project:string;kind:string;amount_cents:number;notes:string;created_at:string};
type Metrics={events:number;confirmed_registrations:number;total_registrations:number;partner_contacts:number};
const money=(v:number)=>new Intl.NumberFormat('en-SG',{style:'currency',currency:'SGD'}).format(v/100);
export function GrowthHub(){const contacts=useRecords<Partner>('v14_partner_contacts','id,name,organization,purpose,stage,source_url');const records=useRecords<Finance>('v14_finance_entries','id,project,kind,amount_cents,notes,created_at');const action=useNotice();const[metrics,setMetrics]=useState<Metrics|null>(null);
 const[name,setName]=useState('');const[org,setOrg]=useState('');const[purpose,setPurpose]=useState('');const[stage,setStage]=useState('research');const[url,setUrl]=useState('');
 const[project,setProject]=useState('');const[kind,setKind]=useState('budget');const[amount,setAmount]=useState('');const[note,setNote]=useState('');
 const refreshMetrics=async()=>{const {data,error}=await db.rpc('v14_growth_metrics');if(error)throw new Error(error.message);setMetrics(data as Metrics);};
 useEffect(()=>{void refreshMetrics().catch(e=>action.setError(e.message));},[]);
 const addPartner=()=>void action.run(async()=>{await mutation('v14_partner_add',{p_name:name,p_organization:org,p_purpose:purpose,p_stage:stage,p_source_url:url});await contacts.refresh();await refreshMetrics();setName('');setOrg('');setPurpose('');setUrl('');},'Contact saved');
 const addMoney=()=>void action.run(async()=>{const cents=Math.round(Number(amount)*100);if(!Number.isFinite(cents)||cents<0||!amount.trim())throw new Error('Enter a valid SGD amount');await mutation('v14_finance_add',{p_project:project,p_kind:kind,p_amount_cents:cents,p_notes:note});await records.refresh();setProject('');setAmount('');setNote('');},'Ledger entry recorded');
 const changeStage=(p:Partner,next:string)=>void action.run(async()=>{await mutation('v16_partner_stage',{p_id:p.id,p_stage:next,p_purpose:p.purpose});await contacts.refresh();await refreshMetrics();},'Partnership stage updated');
 const budget=records.data.filter(r=>r.kind==='budget').reduce((v,r)=>v+Number(r.amount_cents),0);
 const income=records.data.filter(r=>r.kind==='income').reduce((v,r)=>v+Number(r.amount_cents),0);
 const expense=records.data.filter(r=>r.kind==='expense').reduce((v,r)=>v+Number(r.amount_cents),0);
 return <section className="module-section"><p className="section-lead">Growth and partner records for authorized leadership. Current database roles have no standalone Marketing department yet, so access is Fore Director-only until a reviewed role migration is introduced.</p>
 <Notices loading={contacts.loading||records.loading} error={contacts.error||records.error||action.error} success={action.notice}/>
 <div className="metric-row"><div className="metric"><span>Confirmed registrations</span><strong>{metrics?.confirmed_registrations??'—'}</strong></div><div className="metric"><span>Events planned</span><strong>{metrics?.events??'—'}</strong></div><div className="metric"><span>Active partnerships</span><strong>{metrics?.partner_contacts??'—'}</strong></div></div>
 <div className="metric-row"><div className="metric"><span>Project budget entries</span><strong>{money(budget)}</strong></div><div className="metric"><span>Recorded income</span><strong>{money(income)}</strong></div><div className="metric"><span>Recorded expenses</span><strong>{money(expense)}</strong></div></div>
 <h3>Partner contact book</h3><div className="editor-box"><div className="form-grid"><Field label="Contact person"><input value={name} onChange={e=>setName(e.target.value)} maxLength={160}/></Field><Field label="Organisation"><input value={org} onChange={e=>setOrg(e.target.value)} maxLength={160}/></Field>
 <Field label="Purpose / discussion"><input value={purpose} onChange={e=>setPurpose(e.target.value)} maxLength={2000}/></Field><Field label="Relationship stage"><select value={stage} onChange={e=>setStage(e.target.value)}>{['research','contacted','discussion','partner','inactive'].map(s=><option key={s}>{s}</option>)}</select></Field>
 <Field label="Public website or source"><input value={url} onChange={e=>setUrl(e.target.value)} maxLength={600} placeholder="https://..."/></Field><div className="form-actions"><button onClick={addPartner} type="button" disabled={!name||!org||action.busy}>Save contact</button></div></div></div>
 {!contacts.data.length?<Empty>No partnership contacts yet.</Empty>:<div className="record-list">{contacts.data.map(p=><article className="record-card" key={p.id}><strong>{p.organization}</strong> · {p.name}<p>{p.purpose}</p><small>{p.stage} · {p.source_url}</small><div className="record-actions"><label>Update stage <select value={p.stage} onChange={e=>changeStage(p,e.target.value)}>{['research','contacted','discussion','partner','inactive'].map(x=><option key={x}>{x}</option>)}</select></label></div></article>)}</div>}
 <h3>Project budget / revenue log</h3><p className="hint">These are manually entered management records, not verified bank balances or audited financial statements. Do not treat this as accounting software.</p>
 <div className="editor-box"><div className="form-grid"><Field label="Project name"><input value={project} maxLength={140} onChange={e=>setProject(e.target.value)}/></Field>
 <Field label="Record type"><select value={kind} onChange={e=>setKind(e.target.value)}><option value="budget">Allocated budget</option><option value="income">Received income</option><option value="expense">Recorded expense</option></select></Field>
 <Field label="SGD amount"><input type="number" min={0} step="0.01" value={amount} onChange={e=>setAmount(e.target.value)}/></Field><Field label="Notes"><input value={note} maxLength={2000} onChange={e=>setNote(e.target.value)}/></Field><div className="form-actions"><button onClick={addMoney} type="button" disabled={!project||!amount||action.busy}>Record entry</button></div></div></div>
 <div className="v14-scroll"><table className="v14-table"><thead><tr><th>Project</th><th>Type</th><th>Amount</th><th>Date</th></tr></thead><tbody>{records.data.map(r=><tr key={r.id}><td>{r.project}</td><td>{r.kind}</td><td>{money(Number(r.amount_cents))}</td><td>{new Date(r.created_at).toLocaleDateString('en-SG')}</td></tr>)}</tbody></table></div>
 <MarketingTools/>
 <p className="muted-note">Survey segmentation, AI-sourced partner suggestions and social APIs remain separate pending consent rules and provider setup.</p>
 </section>;
}
