import {useMemo,useState} from 'react';
import {mutation} from '../portal-data';
import {downloadText} from '../v14-utils';
import {useRecords,useNotice,Notices,Field} from './common';
import {PALETTE,defaultNode,normalizeDocument,starterWireframe,type CanvasNode,type NodeKind,type StudioDocument} from '../studio/model';
import {PropertiesPanel} from '../studio/StudioCanvas';
import {FabricStudioCanvas as StudioCanvas} from '../studio/FabricStudioCanvas';
import {useLiveStudio} from '../studio/useLiveStudio';
import {useStudioDocument} from '../studio/useStudioDocument';
import {LogicBlocks,PreviewInteraction} from '../studio/LogicBlocks';
import {exportSVG,toReactSource} from '../studio/exporters';
import {useStudioCollaboration,CollaborationPanel} from '../studio/CollaborationPanel';
type StudioRow={id:string;title:string;kind:string;body:unknown;updated_at:string;revision?:number};
const services=['Public website','Supabase database','Stytch login','Edge Function (server action)','File Storage','Email provider','External API','GitHub App'];
export function TechStudio(){
 const saved=useRecords<StudioRow>('v14_studio_documents','id,title,kind,body,updated_at,revision'),action=useNotice();
 const{doc,edit,record,reset,undo,redo}=useStudioDocument(starterWireframe);
 const [toolOpen,setToolOpen]=useState(false);
 const [logicOpen,setLogicOpen]=useState(false);
 const[title,setTitle]=useState('My Study0SG website design'),[selected,setSelected]=useState<string|null>(null),[preview,setPreview]=useState(false),[fileError,setFileError]=useState('');
 const collab=useStudioCollaboration('wireframe',doc,title,reset,setTitle,saved.refresh,(x)=>normalizeDocument(x,'wireframe'));
 const liveStatus=useLiveStudio(collab.id,doc,reset);
 const current=useMemo(()=>doc.nodes.find(n=>n.id===selected)??null,[doc.nodes,selected]);
 const add=(kind:NodeKind)=>{const n=defaultNode(kind,doc.nodes.length,'wireframe');edit(d=>({...d,nodes:[...d.nodes,n]}));setSelected(n.id);setPreview(false);};
 const change=(patch:Partial<CanvasNode>)=>edit(d=>({...d,nodes:d.nodes.map(n=>n.id===selected?{...n,...patch}:n)}));
 const remove=()=>{edit(d=>({...d,nodes:d.nodes.filter(n=>n.id!==selected),logic:d.logic.filter(r=>r.sourceId!==selected&&r.targetId!==selected)}));setSelected(null);};
 const layer=(dir:1|-1)=>edit(d=>{const nodes=[...d.nodes],index=nodes.findIndex(n=>n.id===selected),to=index+dir;if(index<0||to<0||to>=nodes.length)return d;[nodes[index],nodes[to]]=[nodes[to],nodes[index]];return {...d,nodes};});
 const save=()=>void collab.save();
 const open=(row:StudioRow)=>{collab.open(row);setSelected(null);setPreview(false);};
 const exportJSON=()=>downloadText('Study0SG-wireframe.json',JSON.stringify({title,document:doc},null,2),'application/json');
 const importJSON=async(file:File)=>{setFileError('');if(file.size>800_000){setFileError('The design file is too large (max 800 KB).');return;}try{const parsed=JSON.parse(await file.text()) as {title?:string;document?:unknown};reset(normalizeDocument(parsed.document??parsed,'wireframe'));setTitle(String(parsed.title??title).slice(0,150));collab.newDraft();setSelected(null);setPreview(false);}catch{setFileError('Please choose a valid Study0SG design JSON file.');}};
 return <section className="module-section studio-module"><p className="section-lead">Design your page by dragging and resizing elements like a mini Figma. Add Scratch-style logic, try a working preview, and export beginner-friendly React source code. Nothing here is deployed automatically.</p>
  <Notices loading={saved.loading} error={saved.error||collab.error||action.error||fileError} success={action.notice}/>
  <div className="studio-header-fields"><Field label="Project name"><input value={title} maxLength={150} onChange={e=>setTitle(e.target.value)}/></Field><Field label="What will this website help people do?"><input value={doc.explanation} maxLength={350} onChange={e=>edit(d=>({...d,explanation:e.target.value}))}/></Field></div>
  <div className="studio-tabs"><button type="button" className={!preview?'studio-tab-active':'secondary-button'} onClick={()=>setPreview(false)}>Design canvas</button><button type="button" className={preview?'studio-tab-active':'secondary-button'} onClick={()=>setPreview(true)}>▶ Interactive preview</button><button className="secondary-button" type="button" onClick={undo}>↶ Undo</button><button className="secondary-button" type="button" onClick={redo}>↷ Redo</button></div>
  <div className="studio-floating-actions"><span className="hint" aria-live="polite">Live co-editing: {liveStatus}</span><button className="secondary-button" type="button" onClick={()=>setToolOpen(x=>!x)} aria-expanded={toolOpen}>☷ {toolOpen?"Hide tools":"Open elements"}</button><button className="secondary-button" type="button" onClick={()=>setLogicOpen(x=>!x)} aria-expanded={logicOpen}>◇ Logic & APIs</button><button type="button" className="secondary-button" onClick={save} disabled={collab.busy}>Save design</button><details className="studio-team-popover"><summary>↗ Share & collaborate</summary><CollaborationPanel {...collab} save={save}/></details></div><div className="studio-workbench">
    <aside className={toolOpen?"studio-toolbox fabric-tools-open":"studio-toolbox fabric-tools-closed"}><h3>Page pieces</h3><p className="hint">Click to add, then drag on canvas</p><div className="studio-tool-list">{(['heading','text','button','input','card','table','link','badge','image','rectangle','circle','sticker'] as NodeKind[]).map(k=><button type="button" key={k} className="studio-tool" onClick={()=>add(k)} disabled={doc.nodes.length>=120}><strong>+ {PALETTE[k].title}</strong><small>{PALETTE[k].hint}</small></button>)}</div>
      <h3>Layers</h3><div className="studio-layers">{[...doc.nodes].reverse().map(n=><button type="button" key={n.id} aria-pressed={selected===n.id} className={selected===n.id?'studio-layer selected':'studio-layer'} onClick={()=>setSelected(n.id)}>{n.kind} · {(n.text||'shape').slice(0,18)}</button>)}</div>
    </aside>
    <div className="studio-stage">{preview?<PreviewInteraction key={`${collab.id??'new'}-${doc.nodes.length}`} doc={doc}/>:<StudioCanvas doc={doc} edit={edit} record={record} selection={selected} setSelection={setSelected} mode="wireframe"/>}</div>
    {current&&<PropertiesPanel node={current} edit={change} remove={remove} raise={()=>layer(1)} lower={()=>layer(-1)} mode="wireframe"/>}
  </div>
  {logicOpen&&<div className="studio-on-demand"><LogicBlocks doc={doc} edit={edit}/></div>}
  <h3>Backend services — the behind-the-scenes map</h3><p className="hint">Select services your future app may need. This is a planning diagram only; it does not connect to the live database automatically.</p>
  <div className="v14-palette">{services.map(s=><label className="v14-service" key={s}><input type="checkbox" checked={doc.services.includes(s)} onChange={e=>edit(d=>({...d,services:e.target.checked?[...d.services,s]:d.services.filter(v=>v!==s)}))}/>{s}</label>)}</div>
  <div className="studio-service-map"><span>Visitor</span><span aria-hidden="true">→</span><span>Website</span>{doc.services.filter(x=>x!=='Public website').map(s=><span key={s}>↔ {s}</span>)}</div>
  <h3>Save or export your work</h3><div className="record-actions"><button type="button" disabled={!title.trim()||collab.busy} onClick={save}>Save to Study0SG</button><button className="secondary-button" type="button" onClick={()=>downloadText('Study0SG-DesignedPage.tsx',toReactSource(title,doc),'text/plain')}>Download React code</button><button className="secondary-button" type="button" onClick={()=>exportSVG(doc,'Study0SG-wireframe.svg')}>Export SVG</button><button className="secondary-button" type="button" onClick={exportJSON}>Backup design JSON</button></div>
  <label className="studio-file-import">Open JSON design on this device <input type="file" accept="application/json,.json" onChange={e=>{const f=e.target.files?.[0];if(f)void importJSON(f);e.currentTarget.value='';}}/></label>
  <details><summary>See the generated code and its explanations</summary><pre className="v14-code">{toReactSource(title,doc)}</pre></details>
  <h3>Saved wireframes</h3><div className="record-list">{saved.data.filter(s=>{if(s.kind!=='wireframe')return false;const b=s.body as {version?:number;blocks?:unknown[];nodes?:unknown[]};return b?.version===2&&Array.isArray(b.nodes)||Array.isArray(b?.blocks);}).map(s=><article className="record-card" key={s.id}><strong>{s.title}</strong><button className="secondary-button" type="button" onClick={()=>open(s)}>Open design</button></article>)}</div>
  <p className="muted-note">Prototype only: generated frontend code needs an accessibility check, automated tests, server-side validation, and Tech & Security review before deployment. Do not place organizer tokens or participant records in design documents.</p>
 </section>;
}
