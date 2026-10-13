import {useState} from 'react';
import type {CanvasNode,LogicAction,LogicEvent,LogicRule,StudioDocument} from './model';
import {newId} from './model';
import type {EditDocument} from './StudioCanvas';
const ACTIONS:{key:LogicAction;label:string;help:string}[]=[
 {key:'show-message',label:'Show a message',help:'Display a short message on the page'},
 {key:'toggle',label:'Show / hide object',help:'Make a card or text appear / disappear'},
 {key:'set-text',label:'Change words',help:'Replace text inside an object'},
 {key:'open-link',label:'Open website',help:'Open an HTTPS link in a new tab'}
];
export function LogicBlocks({doc,edit}: {doc:StudioDocument;edit:EditDocument}){
 const [dragged,setDragged]=useState<string|null>(null);
 const update=(id:string,patch:Partial<LogicRule>)=>edit(old=>({...old,logic:old.logic.map(r=>r.id===id?{...r,...patch}:r)}));
 const add=()=>edit(old=>({...old,logic:[...old.logic,{id:newId(),event:'click',sourceId:old.nodes.find(n=>n.kind==='button')?.id??old.nodes[0]?.id??'page',action:'show-message',targetId:old.nodes[0]?.id??'page',value:'Welcome to Study0SG!'}]}));
 const changeOrder=(source:string,target:string)=>edit(old=>{
  const rules=[...old.logic],a=rules.findIndex(r=>r.id===source),b=rules.findIndex(r=>r.id===target);if(a<0||b<0||a===b)return old;
  const [item]=rules.splice(a,1);rules.splice(b,0,item);return {...old,logic:rules};
 });
 return <section className="studio-logic-area"><h3>Scratch-style logic blocks</h3>
 <p className="hint">Build actions using small pieces: <strong>When</strong> something happens → <strong>Do</strong> something. Drag blocks up or down to reorder. No JavaScript is executed here.</p>
 {doc.logic.map((rule,i)=><div className="studio-rule" key={rule.id} draggable onDragStart={e=>{e.dataTransfer.effectAllowed='move';setDragged(rule.id);}} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(dragged)changeOrder(dragged,rule.id);setDragged(null);}} onDragEnd={()=>setDragged(null)}>
  <div className="studio-rule-top"><span className="studio-rule-handle" aria-label="Drag to reorder">⋮⋮</span><strong>Logic {i+1}</strong><button type="button" className="danger-button" onClick={()=>edit(old=>({...old,logic:old.logic.filter(x=>x.id!==rule.id)}))}>Remove</button></div>
  <div className="studio-rule-event"><span>WHEN</span><select aria-label="Event" value={rule.event} onChange={e=>update(rule.id,{event:e.target.value as LogicEvent,sourceId:e.target.value==='load'?'page':(doc.nodes[0]?.id??'page')})}><option value="click">Someone clicks</option><option value="load">The page opens</option></select>
   {rule.event==='click'&&<select aria-label="Clicked object" value={rule.sourceId} onChange={e=>update(rule.id,{sourceId:e.target.value})}>{doc.nodes.map(n=><option value={n.id} key={n.id}>{n.kind}: {n.text.slice(0,30)||n.id.slice(0,6)}</option>)}</select>}
  </div>
  <div className="studio-rule-action"><span>DO</span><select aria-label="Action" value={rule.action} onChange={e=>update(rule.id,{action:e.target.value as LogicAction})}>{ACTIONS.map(a=><option key={a.key} value={a.key}>{a.label}</option>)}</select>
    {['toggle','set-text'].includes(rule.action)&&<select aria-label="Object to change" value={rule.targetId} onChange={e=>update(rule.id,{targetId:e.target.value})}>{doc.nodes.map(n=><option value={n.id} key={n.id}>{n.kind}: {n.text.slice(0,25)||n.id.slice(0,6)}</option>)}</select>}
    {rule.action!=='toggle'&&<input aria-label="Action value" value={rule.value} maxLength={rule.action==='open-link'?250:280} placeholder={rule.action==='open-link'?'https://example.com':'Text to display'} onChange={e=>update(rule.id,{value:e.target.value})}/>}
  </div>
  {rule.action==='open-link'&&rule.value&&!/^https:\/\//.test(rule.value)&&<p className="studio-rule-error">Only HTTPS links can open in preview or generated code.</p>}
  <small>{ACTIONS.find(a=>a.key===rule.action)?.help}</small>
 </div>)}
 <button type="button" className="secondary-button" disabled={doc.logic.length>=60} onClick={add}>+ Add a logic block</button>
 </section>;
}

export function PreviewInteraction({doc}: {doc:StudioDocument}){
 const [hidden,setHidden]=useState<string[]>([]),[words,setWords]=useState<Record<string,string>>({}),[notice,setNotice]=useState('');
 const execute=(event:'click'|'load',source:string)=>{
  doc.logic.filter(rule=>rule.event===event&&rule.sourceId===source).forEach(rule=>{
   if(rule.action==='show-message')setNotice(rule.value.slice(0,280));
   if(rule.action==='toggle')setHidden(v=>v.includes(rule.targetId)?v.filter(x=>x!==rule.targetId):[...v,rule.targetId]);
   if(rule.action==='set-text')setWords(v=>({...v,[rule.targetId]:rule.value.slice(0,800)}));
   if(rule.action==='open-link')try{const u=new URL(rule.value);if(u.protocol==='https:')window.open(u.href,'_blank','noopener,noreferrer');}catch{/* bad URL */}
  });
 };
 // An explicit 'Start preview' button triggers load rules without React effect-loop issues.
 const [started,setStarted]=useState(false);
 return <div className="studio-preview-area"><div className="record-actions"><button className="secondary-button" type="button" onClick={()=>{setStarted(true);setHidden([]);setWords({});setNotice('');window.setTimeout(()=>execute('load','page'),0);}}>Start / restart preview</button><span className="hint">Try clicking your buttons. Changes here are temporary.</span></div>
 {!started?<p className="hint">Click Start preview to run your page logic.</p>:<div className="studio-functional-page" style={{aspectRatio:`${doc.canvas.width} / ${doc.canvas.height}`,background:doc.canvas.background}}>
 {doc.nodes.filter(n=>!hidden.includes(n.id)).map(n=>{
  const style:React.CSSProperties={left:`${n.x/doc.canvas.width*100}%`,top:`${n.y/doc.canvas.height*100}%`,width:`${n.w/doc.canvas.width*100}%`,height:`${n.h/doc.canvas.height*100}%`,fontSize:`clamp(11px, ${n.fontSize/2}px, ${n.fontSize}px)`,background:['heading','text','link'].includes(n.kind)?'transparent':n.fill,color:n.color,borderRadius:n.kind==='circle'?'50%':n.radius,opacity:n.opacity};
  const label=words[n.id]??n.text;
  if(n.kind==='button'||n.kind==='link')return <button key={n.id} type="button" style={style} onClick={()=>execute('click',n.id)}>{label}</button>;
  if(n.kind==='input')return <label key={n.id} style={style}><span>{label}</span><input aria-label={label}/></label>;
  if(n.kind==='image')return <div key={n.id} style={style}>{n.src?<img alt={label} src={n.src} />:'Image placeholder'}</div>;
  if(n.kind==='heading')return <h3 key={n.id} style={style}>{label}</h3>;
  return <div key={n.id} style={style} onClick={()=>execute('click',n.id)}>{n.kind==='rectangle'||n.kind==='circle'?'':label}</div>;
 })}
 </div>}
 {notice&&<p className="studio-preview-notice" role="status">{notice}</p>}
 </div>;
}
