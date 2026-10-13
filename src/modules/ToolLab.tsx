import {useState} from 'react';
import {downloadText} from '../v14-utils';
import {useRecords,Field,Notices} from './common';
import {mutation} from '../portal-data';
import {evaluateLab,type Lab,type RuleKind,type Rule} from '../security/tool-rules';
type Saved={id:string;kind:string;title:string;body:Lab;revision:number};
const checks:{kind:RuleKind;name:string;description:string}[]=[
 {kind:'missing_auth',name:'Missing sign-in',description:'No signed-in user tries to access a protected action'},
 {kind:'sensitive_path',name:'Restricted route',description:'Someone tries to open a restricted admin path'},
 {kind:'rate_spike',name:'Too many requests',description:'A single user sends more requests than expected'},
 {kind:'script_marker',name:'Unsafe HTML marker',description:'Text includes an HTML script tag'},
 {kind:'sql_marker',name:'Suspicious query marker',description:'Text resembles a basic SQL injection attempt'},
];
const initial:Lab={name:'My defensive request checker',rules:checks.map(x=>({id:x.kind,kind:x.kind,enabled:true,decision:'block'}))};
const cases=[{name:'Normal visitor',path:'/events',signedIn:true,count:2,input:'register interest',expected:'allow'},
 {name:'Guest on admin page',path:'/admin',signedIn:false,count:1,input:'',expected:'block'},
 {name:'Burst traffic',path:'/events',signedIn:true,count:150,input:'',expected:'block'},
 {name:'Script-shaped input',path:'/comments',signedIn:true,count:1,input:'<script>example</script>',expected:'block'},
 {name:'Query-shaped input',path:'/search',signedIn:true,count:2,input:"' OR 1=1 --",expected:'block'}] as const;
export function ToolLab(){
 const saved=useRecords<Saved>('v14_studio_documents','id,kind,title,body,revision');
 const [lab,setLab]=useState<Lab>(initial),[id,setId]=useState<string|null>(null),[rev,setRev]=useState(0),[past,setPast]=useState<Lab[]>([]),[future,setFuture]=useState<Lab[]>([]),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const apply=(next:Lab)=>{setPast(p=>[...p.slice(-29),lab]);setFuture([]);setLab(next);};
 const undo=()=>{const x=past.at(-1);if(!x)return;setFuture(f=>[...f,lab]);setPast(p=>p.slice(0,-1));setLab(x);};
 const redo=()=>{const x=future.at(-1);if(!x)return;setPast(p=>[...p,lab]);setFuture(p=>p.slice(0,-1));setLab(x);};
 const save=async()=>{setBusy(true);setMessage('');try{const r=await mutation<{id:string;revision:number}>('v16_studio_save',{p_kind:'tool',p_title:lab.name,p_body:lab,p_id:id,p_expected_revision:rev});setId(r.id);setRev(r.revision);setMessage(`Tool draft saved (revision ${r.revision}).`);await saved.refresh();}catch(e){setMessage(e instanceof Error?e.message:'Could not save');}finally{setBusy(false);}};
 const results=cases.map(c=>({...c,...evaluateLab(lab,c)}));const passed=results.filter(r=>r.verdict===r.expected).length;
 return <section className="module-section"><p className="section-lead">Build a defensive request-checking tool, then try it against five harmless simulated situations. Nothing is sent to another website or network. This is a training test-bed, not a penetration-testing scanner or production WAF.</p>
 <Notices loading={saved.loading} error={saved.error}/><div className="studio-header-fields"><Field label="Tool name"><input value={lab.name} maxLength={150} onChange={e=>apply({...lab,name:e.target.value})}/></Field></div>
 <div className="record-actions"><button type="button" className="secondary-button" onClick={undo} disabled={!past.length}>↶ Undo</button><button type="button" className="secondary-button" onClick={redo} disabled={!future.length}>↷ Redo</button></div>
 <h3>Build your defence using logic blocks</h3><div className="tool-rule-grid">{lab.rules.map(rule=>{const info=checks.find(c=>c.kind===rule.kind)!;return <div className="tool-rule-card" key={rule.id}><strong>IF · {info.name}</strong><p>{info.description}</p><label><input type="checkbox" checked={rule.enabled} onChange={e=>apply({...lab,rules:lab.rules.map(r=>r.id===rule.id?{...r,enabled:e.target.checked}:r)})}/> Enable this check</label><label>THEN <select value={rule.decision} onChange={e=>apply({...lab,rules:lab.rules.map(r=>r.id===rule.id?{...r,decision:e.target.value as Rule['decision']}:r)})}><option value="block">Block</option><option value="review">Flag for review</option></select></label></div>})}</div>
 <h3>Safe attack-simulation test bench</h3><p className="hint">Tests use example strings and local functions only. They never perform scans, real SQL injection, password guessing, or network requests.</p>
 <div className="metric-row"><div className="metric"><span>Expected results matched</span><strong>{passed} / {results.length}</strong></div><div className="metric"><span>Rules switched on</span><strong>{lab.rules.filter(x=>x.enabled).length}</strong></div></div>
 <div className="v14-scroll"><table className="v14-table"><thead><tr><th>Simulated case</th><th>Expected</th><th>Tool result</th><th>Checks triggered</th></tr></thead><tbody>{results.map(r=><tr key={r.name}><td>{r.name}</td><td>{r.expected}</td><td>{r.verdict===r.expected?'✓':'⚠'} {r.verdict}</td><td>{r.findings.map(kind=>checks.find(c=>c.kind===kind)?.name??kind).join(', ')||'none'}</td></tr>)}</tbody></table></div>
 <div className="record-actions"><button type="button" disabled={busy||lab.name.trim().length<3} onClick={()=>void save()}>{busy?'Saving…':'Save tool draft'}</button><button type="button" className="secondary-button" onClick={()=>downloadText('Study0SG-defensive-tool.json',JSON.stringify({type:'safe-rule-simulator',lab,results},null,2),'application/json')}>Export tool & test report</button></div>{message&&<p role="status">{message}</p>}
 <h3>Saved defensive tools</h3><div className="record-list">{saved.data.filter(s=>s.kind==='tool').map(s=><article key={s.id} className="record-card"><strong>{s.title}</strong><button type="button" className="secondary-button" onClick={()=>{setLab(s.body);setId(s.id);setRev(s.revision??0);setPast([]);setFuture([]);}}>Open tool</button></article>)}</div>
 <p className="muted-note">Rules are intentionally simplified educational examples. Real apps require authentication, throttling, validated input and security review at the server. A successful simulation is not proof of real-world protection.</p>
 </section>;
}
