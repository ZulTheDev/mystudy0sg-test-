import {useMemo,useState} from 'react';
import {useRecords,Field,Notices} from './common';
import {defaultNode,normalizeDocument,starterSecurity,type CanvasNode,type StudioDocument} from '../studio/model';
import {StudioCanvas,PropertiesPanel} from '../studio/StudioCanvas';
import {useStudioDocument} from '../studio/useStudioDocument';
import {useStudioCollaboration,CollaborationPanel} from '../studio/CollaborationPanel';
import {downloadText} from '../v14-utils';
import {exportSVG} from '../studio/exporters';
type Saved={id:string;title:string;kind:string;body:unknown;revision:number};
const elements=[
 ['User / device','A person or trusted device','#e3eeff'],
 ['API gateway','Receives requests and checks them','#ffe6c7'],
 ['Application service','Runs an approved backend task','#faefd0'],
 ['Database','Protects stored information','#e1f5e4'],
 ['Identity provider','Checks who is signing in','#e4dcfc'],
 ['Firewall / WAF','Blocks unsafe traffic','#ffcfcf'],
 ['Secret vault','Protects service credentials','#fce0ef'],
 ['Monitoring','Detects errors and suspicious events','#d9eff4'],
 ['Backup storage','Recovery when things go wrong','#f4eee0'],
 ['Deployment pipeline','Checks code before release','#dff1da'],
] as const;
export function SecurityStudio(){
 const stored=useRecords<Saved>('v14_studio_documents','id,title,kind,body,revision');
 const {doc,edit,record,reset,undo,redo}=useStudioDocument(starterSecurity);
 const [title,setTitle]=useState('Study0SG backend security map'),[selected,setSelected]=useState<string|null>(null),[from,setFrom]=useState(''),[to,setTo]=useState(''),[label,setLabel]=useState('HTTPS + JWT');
 const collab=useStudioCollaboration('security',doc,title,reset,setTitle,stored.refresh,(v)=>normalizeDocument(v,'wireframe'));
 const node=useMemo(()=>doc.nodes.find(n=>n.id===selected)??null,[doc.nodes,selected]);
 const add=(name:string,color:string)=>{const n:CanvasNode={...defaultNode('card',doc.nodes.length,'wireframe'),w:225,h:108,text:name,fill:color,fontSize:21};edit(d=>({...d,nodes:[...d.nodes,n]}));setSelected(n.id);};
 const addConnection=()=>{if(!from||!to||from===to)return;edit(d=>({...d,connections:[...(d.connections??[]).filter(e=>!(e.from===from&&e.to===to)),{from,to,label:label.slice(0,80)}]}));};
 const manifest={purpose:doc.explanation,trustBoundaries:(doc.connections??[]).map(e=>({from:doc.nodes.find(n=>n.id===e.from)?.text,to:doc.nodes.find(n=>n.id===e.to)?.text,protection:e.label})),controls:doc.services,note:'Review plan only. Do not automatically deploy changes or paste real secrets.'};
 return <section className="module-section studio-module"><p className="section-lead">Design a backend and security architecture visually. Put services on the canvas, connect them, and explain what protects each connection. The output is a reviewed design plan—not an executable attack or firewall configuration.</p>
 <Notices loading={stored.loading} error={stored.error}/><div className="studio-header-fields"><Field label="Security design name"><input value={title} onChange={e=>setTitle(e.target.value)} maxLength={150}/></Field><Field label="What is this system meant to protect?"><input value={doc.explanation} onChange={e=>edit(d=>({...d,explanation:e.target.value}))} maxLength={350}/></Field></div>
 <div className="record-actions"><button type="button" className="secondary-button" onClick={undo}>↶ Undo</button><button type="button" className="secondary-button" onClick={redo}>↷ Redo</button></div>
 <div className="studio-workbench"><aside className="studio-toolbox"><h3>Security building blocks</h3><div className="studio-tool-list">{elements.map(([name,hint,color])=><button key={name} className="studio-tool" type="button" onClick={()=>add(name,color)} disabled={doc.nodes.length>=100}><strong>+ {name}</strong><small>{hint}</small></button>)}</div></aside>
 <div className="studio-stage"><StudioCanvas doc={doc} edit={edit} record={record} selection={selected} setSelection={setSelected} mode="wireframe"/></div>
 <PropertiesPanel node={node} edit={patch=>edit(d=>({...d,nodes:d.nodes.map(n=>n.id===selected?{...n,...patch}:n)}))} remove={()=>{edit(d=>({...d,nodes:d.nodes.filter(n=>n.id!==selected),connections:(d.connections??[]).filter(e=>e.from!==selected&&e.to!==selected)}));setSelected(null);}} raise={()=>{}} lower={()=>{}} mode="wireframe"/>
 </div>
 <h3>Connect two services</h3><div className="form-grid"><Field label="From"><select value={from} onChange={e=>setFrom(e.target.value)}><option value="">Select service</option>{doc.nodes.map(n=><option value={n.id} key={n.id}>{n.text.slice(0,45)}</option>)}</select></Field><Field label="To"><select value={to} onChange={e=>setTo(e.target.value)}><option value="">Select service</option>{doc.nodes.map(n=><option value={n.id} key={n.id}>{n.text.slice(0,45)}</option>)}</select></Field><Field label="What protects this connection?"><input value={label} onChange={e=>setLabel(e.target.value)} maxLength={80}/></Field><div className="form-actions"><button type="button" onClick={addConnection} disabled={!from||!to||from===to}>Connect on canvas</button></div></div>
 <div className="record-list">{(doc.connections??[]).map((edge,i)=><div className="record-card" key={`${edge.from}-${edge.to}-${i}`}>{doc.nodes.find(n=>n.id===edge.from)?.text} → {doc.nodes.find(n=>n.id===edge.to)?.text} · {edge.label} <button className="secondary-button" type="button" onClick={()=>edit(d=>({...d,connections:(d.connections??[]).filter((_,index)=>i!==index)}))}>Remove</button></div>)}</div>
 <h3>Protection checklist</h3><div className="v14-palette">{['Least privilege','HTTPS everywhere','JWT and session checks','Audit logging','Encrypted backups','Rate limits','Secret rotation','Security scanning'].map(item=><label key={item} className="v14-service"><input type="checkbox" checked={doc.services.includes(item)} onChange={e=>edit(d=>({...d,services:e.target.checked?[...d.services,item]:d.services.filter(s=>s!==item)}))}/>{item}</label>)}</div>
 <CollaborationPanel {...collab} save={()=>{void collab.save();}}/>
 <div className="record-actions"><button type="button" onClick={()=>void collab.save()} disabled={collab.busy}>Save security map</button><button type="button" className="secondary-button" onClick={()=>exportSVG(doc,'Study0SG-security-architecture.svg')}>Export SVG diagram</button><button type="button" className="secondary-button" onClick={()=>downloadText('Study0SG-security-review.json',JSON.stringify({title,...manifest},null,2),'application/json')}>Export security review plan</button><button type="button" className="secondary-button" onClick={()=>downloadText('Study0SG-security-editable.json',JSON.stringify({title,document:doc},null,2),'application/json')}>Backup editable JSON</button></div>
 <h3>Saved security maps</h3><div className="record-list">{stored.data.filter(x=>x.kind==='security').map(x=><article key={x.id} className="record-card"><strong>{x.title}</strong><button className="secondary-button" type="button" onClick={()=>collab.open(x)}>Open shared design</button></article>)}</div>
 </section>;
}
