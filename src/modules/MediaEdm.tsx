import {useMemo,useState} from 'react';
import {mutation} from '../portal-data';
import {downloadText} from '../v14-utils';
import {useRecords,useNotice,Notices,Field} from './common';
import {defaultNode,PALETTE,normalizeDocument,starterPoster,type CanvasNode,type NodeKind} from '../studio/model';
import {StudioCanvas,PropertiesPanel} from '../studio/StudioCanvas';
import {useStudioDocument} from '../studio/useStudioDocument';
import {exportPNG,exportSVG} from '../studio/exporters';
import {useStudioCollaboration,CollaborationPanel} from '../studio/CollaborationPanel';
type StudioRow={id:string;title:string;kind:string;body:unknown;updated_at:string;revision?:number};
const posterElements:NodeKind[]=['heading','text','button','badge','rectangle','circle','sticker','image','card'];
export function MediaEdm(){
 const stored=useRecords<StudioRow>('v14_studio_documents','id,title,kind,body,updated_at,revision'),action=useNotice();
 const {doc,edit,record,reset,undo,redo}=useStudioDocument(starterPoster);
 const [title,setTitle]=useState('Study0SG Event Poster'),[selection,setSelection]=useState<string|null>(null),[error,setError]=useState('');
 const collab=useStudioCollaboration('edm',doc,title,reset,setTitle,stored.refresh,(x)=>normalizeDocument(x,'poster'));
 const current=useMemo(()=>doc.nodes.find(n=>n.id===selection)??null,[doc.nodes,selection]);
 const add=(kind:NodeKind)=>{const node=defaultNode(kind,doc.nodes.length,'poster');edit(d=>({...d,nodes:[...d.nodes,node]}));setSelection(node.id);};
 const change=(patch:Partial<CanvasNode>)=>edit(d=>({...d,nodes:d.nodes.map(n=>n.id===selection?{...n,...patch}:n)}));
 const remove=()=>{edit(d=>({...d,nodes:d.nodes.filter(n=>n.id!==selection)}));setSelection(null);};
 const layer=(delta:1|-1)=>edit(d=>{const nodes=[...d.nodes],from=nodes.findIndex(n=>n.id===selection),to=from+delta;if(from<0||to<0||to>=nodes.length)return d;[nodes[from],nodes[to]]=[nodes[to],nodes[from]];return {...d,nodes};});
 const addImage=async(file:File)=>{
  setError('');if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>450_000){setError('Choose a PNG, JPEG or WebP smaller than 450 KB.');return;}
  try{const src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Cannot load photo'));reader.readAsDataURL(file);});change({src});}
  catch{setError('Could not read this photo.');}
 };
 const save=()=>{
  // Poster image data stays in local export, never in the shared database JSON.
  const minimal={...doc,nodes:doc.nodes.map(n=>n.src?{...n,src:undefined}:n)};
  void collab.save(minimal);
 };
 const activate=(row:StudioRow)=>{collab.open(row);setSelection(null);setError('');};
 const backup=()=>downloadText('Study0SG-poster-design.json',JSON.stringify({title,document:doc},null,2),'application/json');
 const importJSON=async(file:File)=>{setError('');if(file.size>1_200_000){setError('Maximum design file size is 1.2 MB');return;}try{const v=JSON.parse(await file.text()) as {title?:string;document?:unknown};reset(normalizeDocument(v.document??v,'poster'));collab.newDraft();setTitle(String(v.title??title).slice(0,150));setSelection(null);}catch{setError('Invalid Study0SG JSON design file.');}};
 const publishRequest=()=>downloadText('Study0SG-EDM-review-request.json',JSON.stringify({title,document:{...doc,nodes:doc.nodes.map(n=>n.src?{...n,src:undefined}:n)},status:'needs-human-approval',instructions:'Public-event draft only; send through reviewed GitHub/social workflow. Never include participant records or secrets.'},null,2),'application/json');
 return <section className="module-section studio-module"><p className="section-lead">Create your own poster with movable words, shapes, stickers, and photos—a lighter Canva-style editor. Export SVG or PNG for review. Publishing to social media still needs authorized integrations.</p>
  <Notices loading={stored.loading} error={stored.error||collab.error||action.error||error} success={action.notice}/>
  <div className="studio-header-fields"><Field label="Poster name"><input value={title} maxLength={150} onChange={e=>setTitle(e.target.value)}/></Field><Field label="Background color"><input type="color" value={doc.canvas.background} onChange={e=>edit(d=>({...d,canvas:{...d.canvas,background:e.target.value}}))}/></Field></div>
  <div className="studio-tabs"><button type="button" className="secondary-button" onClick={undo}>↶ Undo</button><button type="button" className="secondary-button" onClick={redo}>↷ Redo</button><span className="hint">Click an object to edit. Drag it to move; drag the orange corner to resize.</span></div>
  <div className="studio-workbench"><aside className="studio-toolbox"><h3>Poster elements</h3><div className="studio-tool-list">{posterElements.map(k=><button key={k} type="button" className="studio-tool" disabled={doc.nodes.length>=100} onClick={()=>add(k)}><strong>+ {PALETTE[k].title}</strong><small>{PALETTE[k].hint}</small></button>)}</div><h3>Layer order</h3><div className="studio-layers">{[...doc.nodes].reverse().map(n=><button key={n.id} type="button" aria-pressed={selection===n.id} className={selection===n.id?'studio-layer selected':'studio-layer'} onClick={()=>setSelection(n.id)}>{n.kind} · {(n.text||'shape').slice(0,16)}</button>)}</div></aside>
   <div className="studio-stage"><StudioCanvas doc={doc} edit={edit} record={record} selection={selection} setSelection={setSelection} mode="poster"/></div>
   <PropertiesPanel node={current} edit={change} remove={remove} raise={()=>layer(1)} lower={()=>layer(-1)} mode="poster" addImage={addImage}/>
  </div>
  <CollaborationPanel {...collab} save={save}/>
  <h3>Save and export poster</h3><div className="record-actions"><button type="button" disabled={!title.trim()||collab.busy} onClick={save}>Save layout</button><button type="button" className="secondary-button" onClick={()=>exportSVG(doc,'Study0SG-EDM.svg')}>Download SVG</button><button type="button" className="secondary-button" onClick={()=>{setError('');void exportPNG(doc).catch(e=>setError(e instanceof Error?e.message:'PNG export failed'));}}>Download PNG (2×)</button><button type="button" className="secondary-button" onClick={backup}>Download editable JSON</button><button type="button" className="secondary-button" onClick={publishRequest}>Export publishing review request</button></div>
  <label className="studio-file-import">Import editable poster JSON <input type="file" accept="application/json,.json" onChange={e=>{const f=e.target.files?.[0];if(f)void importJSON(f);e.currentTarget.value='';}}/></label>
  <p className="muted-note">Uploaded images are stored only in this browser session and included in SVG/PNG/JSON exports. Due to the existing 50 KB database document limit, they are <strong>not saved in Supabase</strong>. Back up your editable JSON or export the artwork before leaving. Do not add participant PII to posters.</p>
  <h3>Saved poster layouts</h3><div className="record-list">{stored.data.filter(s=>{if(s.kind!=='edm')return false;const b=s.body as {headline?:unknown;version?:number;nodes?:unknown[]};return typeof b?.headline==='string'||(b?.version===2&&Array.isArray(b.nodes));}).map(s=><article className="record-card" key={s.id}><strong>{s.title}</strong><p>Updated {new Date(s.updated_at).toLocaleDateString('en-SG')}</p><button type="button" className="secondary-button" onClick={()=>activate(s)}>Open poster</button></article>)}</div>
 </section>;
}
