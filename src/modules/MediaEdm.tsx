import {useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {downloadText} from '../v14-utils';
import {useRecords,Notices,Field} from './common';
import {defaultNode,fitNewNode,PALETTE,normalizeDocument,resizeArtboard,starterPoster,type CanvasNode,type NodeKind} from '../studio/model';
import {StudioCanvas,PropertiesPanel} from '../studio/StudioCanvas';
import {ArtboardSizeControls} from '../studio/ArtboardSizeControls';
import {useStudioDocument} from '../studio/useStudioDocument';
import {exportPNG,exportSVG} from '../studio/exporters';
import {useStudioCollaboration,CollaborationPanel} from '../studio/CollaborationPanel';
import {readLocalDraft,saveLocalDraft,clearLocalDraft,purgeOldLocalDrafts} from '../studio/localDrafts';
import {Study0SGLogo} from '../components/Study0SGLogo';
import {getPortalToken} from '../supabase-portal';
type StudioRow={id:string;title:string;kind:string;body:unknown;updated_at:string;revision?:number};
type Tool='size'|'style'|'elements'|'text'|'photos'|'branding'|'layers'|'ai';
const shapes:NodeKind[]=['rectangle','circle','line','polygon','abstract'];
const layouts:[string,number,number][]=[['Square poster',1080,1080],['Instagram portrait',1080,1350],['Landscape slide',1280,720],['A4 portrait',794,1123],['Story / reel',900,1600]];
export function MediaEdm(){
 const stored=useRecords<StudioRow>('v14_studio_documents','id,title,kind,body,updated_at,revision');
 const {doc,edit,record,reset,undo,redo}=useStudioDocument(starterPoster);
 const [title,setTitle]=useState('Study0SG event poster'),[selection,setSelection]=useState<string|null>(null),[error,setError]=useState('');
 const [aiPrompt,setAiPrompt]=useState(''),[aiBusy,setAiBusy]=useState(false),[aiImage,setAiImage]=useState(''),[aiStatus,setAiStatus]=useState('');
 const [fullscreen,setFullscreen]=useState(true),[tool,setTool]=useState<Tool>('elements'),[photoTab,setPhotoTab]=useState<'upload'|'r2'|'drive'>('upload'),[showCollab,setShowCollab]=useState(false),[showProperties,setShowProperties]=useState(false),[pickerOpen,setPickerOpen]=useState(false),[deviceNote,setDeviceNote]=useState('');
 const collab=useStudioCollaboration('edm',doc,title,reset,setTitle,stored.refresh,(x)=>normalizeDocument(x,'poster'));
 const current=useMemo(()=>doc.nodes.find(n=>n.id===selection)??null,[doc.nodes,selection]);
 useEffect(()=>{void (async()=>{try{await purgeOldLocalDrafts();const saved=await readLocalDraft('edm');if(saved){reset(normalizeDocument(saved.document,'poster'));setTitle(saved.title);setDeviceNote('Recovered your device-only design draft (expires after 7 days).');}}catch{ /* Browser blocks offline storage; exports remain available. */}})();},[]);
 useEffect(()=>{const timer=window.setTimeout(()=>void saveLocalDraft('edm',doc,title).catch(()=>{}),900);return()=>window.clearTimeout(timer);},[doc,title]);
 const add=(kind:NodeKind)=>{if(doc.nodes.length>=130){setError('Maximum 130 objects per poster.');return;}const node=fitNewNode(defaultNode(kind,doc.nodes.length,'poster'),doc);edit(d=>({...d,nodes:[...d.nodes,node]}));setSelection(node.id);setShowProperties(true);};
 const change=(patch:Partial<CanvasNode>)=>edit(d=>({...d,nodes:d.nodes.map(n=>n.id===selection?{...n,...patch}:n)}));
 const remove=()=>{edit(d=>({...d,nodes:d.nodes.filter(n=>n.id!==selection)}));setSelection(null);};
 const layer=(delta:1|-1)=>edit(d=>{const nodes=[...d.nodes],from=nodes.findIndex(n=>n.id===selection),to=from+delta;if(from<0||to<0||to>=nodes.length)return d;[nodes[from],nodes[to]]=[nodes[to],nodes[from]];return {...d,nodes};});
 const addImage=async(file:File)=>{
  setError('');if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>1_250_000){setError('Choose PNG, JPG or WebP smaller than 1.25 MB.');return;}
  try{const src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Cannot read photo'));reader.readAsDataURL(file);});
    if(current?.kind==='image')change({src});else{const node=fitNewNode(defaultNode('image',doc.nodes.length,'poster'),doc);edit(d=>({...d,nodes:[...d.nodes,{...node,src}]}));setSelection(node.id);}
    setDeviceNote('This image stays on this device only. Download JSON or PNG to keep it permanently.');
  }catch{setError('Could not read this photo.');}
 };
 const save=()=>{const minimal={...doc,nodes:doc.nodes.map(n=>n.src?{...n,src:undefined}:n)};void collab.save(minimal);};
 const activate=(row:StudioRow)=>{collab.open(row);setSelection(null);setError('');};
 const backup=()=>downloadText('Study0SG-EDM-editable.json',JSON.stringify({title,document:doc},null,2),'application/json');
 const importJSON=async(file:File)=>{setError('');if(file.size>3_000_000){setError('Maximum design JSON size is 3 MB');return;}try{const v=JSON.parse(await file.text()) as {title?:string;document?:unknown};reset(normalizeDocument(v.document??v,'poster'));collab.newDraft();setTitle(String(v.title??title).slice(0,150));setSelection(null);}catch{setError('Invalid Study0SG design file.');}};
 const review=()=>downloadText('Study0SG-EDM-review.json',JSON.stringify({title,document:{...doc,nodes:doc.nodes.map(n=>({...n,src:undefined}))},status:'needs-human-approval',disclaimer:'No automatic public posting or student data permitted.'},null,2),'application/json');
 const setSize=(w:number,h:number)=>edit(d=>resizeArtboard(d,w,h));
 const generateImage=async()=>{const token=getPortalToken();if(!token){setError('Sign in to use AI media');return;}
  setAiBusy(true);setError('');setAiStatus('');try{
   const res=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/media-generate`,{
    method:'POST',headers:{'Content-Type':'application/json',apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`},
    body:JSON.stringify({prompt:aiPrompt,shape:'square'})});
   const out=await res.json().catch(()=>({})) as {error?:string;image_url?:string;remaining_today?:number};
   if(!res.ok||!out.image_url)throw Error(out.error||'Could not create media');
   setAiImage(out.image_url);setAiStatus(`Preview ready. ${out.remaining_today??0} personal requests remain today. Open and save the image before the temporary provider URL expires.`);
  }catch(e){setError(e instanceof Error?e.message:'AI image service unavailable');}
  finally{setAiBusy(false);}
 };
 // Keep the editing surface outside the narrow portal layout while full screen.
 useEffect(()=>{
  if(!fullscreen)return;
  const oldOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  const escape=(event:KeyboardEvent)=>{if(event.key==='Escape')setFullscreen(false);};
  window.addEventListener('keydown',escape);
  return()=>{document.body.style.overflow=oldOverflow;window.removeEventListener('keydown',escape);};
 },[fullscreen]);
 const studio=<section className={`module-section studio-module studio-v2 ${fullscreen?'studio-fullscreen':''}`} aria-label="EDM poster editor">
  <div className="studio-v2-header"><div className="studio-v2-brand"><details className="studio-logo-dropdown"><summary className="studio-logo-menu" title="Open Study0SG navigation"><Study0SGLogo/> <span>Study0SG <small>EDM Studio ▾</small></span></summary><nav className="studio-logo-links" aria-label="Studio quick navigation"><a href="#/dashboard?module=dashboard" onClick={()=>setFullscreen(false)}>⌂ Dashboard</a><a href="#/dashboard?module=rag" onClick={()=>setFullscreen(false)}>✦ AI Workspaces</a><a href="#/dashboard?module=my_tasks" onClick={()=>setFullscreen(false)}>☑ My Tasks</a><a href="#/dashboard?module=tech_studio" onClick={()=>setFullscreen(false)}>▣ Wireframe Builder</a></nav></details><Field label="Poster name"><input value={title} maxLength={150} onChange={e=>setTitle(e.target.value)}/></Field></div>
    <div className="studio-v2-main-actions"><button className="secondary-button" onClick={undo}>↶</button><button className="secondary-button" onClick={redo}>↷</button><button onClick={save} disabled={collab.busy}>💾 Save layout</button><button className="secondary-button" onClick={()=>setShowCollab(v=>!v)}>♧ Share</button><button className="secondary-button" onClick={()=>exportSVG(doc,'Study0SG-poster.svg')}>↓ SVG</button><button className="secondary-button" onClick={()=>{void exportPNG(doc).catch(e=>setError(String(e)));}}>↓ PNG</button><button className="secondary-button" onClick={backup}>↓ JSON</button><button className="secondary-button" onClick={()=>setFullscreen(v=>!v)}>{fullscreen?'↙ Exit full screen':'⛶ Full screen'}</button></div>
    <ArtboardSizeControls doc={doc} edit={edit} compact/></div>
  <Notices loading={stored.loading} error={stored.error||collab.error||error} success={collab.notice||deviceNote}/>
  <div className="studio-v2-body"><aside className="studio-v2-hover-tools" aria-label="Poster tools">
    {([['size','▣','Canvas size'],['style','◩','Template style'],['elements','◇','Shapes & elements'],['photos','▧','Photos & uploads'],['branding','✿','Branding stickers'],['text','T','Text styling'],['layers','☷','Layer order'],['ai','✦','AI illustration']] as [Tool,string,string][]).map(([key,icon,label])=><button key={key} type="button" className={pickerOpen&&tool===key?'active':''} aria-expanded={pickerOpen&&tool===key} onClick={()=>{if(tool===key)setPickerOpen(open=>!open);else{setTool(key);setPickerOpen(true);}}} title={label}><span>{icon}</span><small>{label}</small></button>)}
   </aside>{pickerOpen&&<aside className="studio-v2-picker" aria-label="Selected poster tools">
     <div className="studio-v2-picker-head"><h3>{({size:'Poster size',style:'Canvas styles',elements:'Shapes & elements',photos:'Image library',branding:'Study0SG brand',text:'Text settings',layers:'Layer manager',ai:'AI illustration · fal.ai'})[tool]}</h3><button className="secondary-button" type="button" onClick={()=>setPickerOpen(false)} aria-label="Close tools">✕</button></div>
     {tool==='size'&&<div className="studio-tool-list"><p className="hint">Use the W × H inputs above or drag the bottom-right orange handle on the artwork.</p>{layouts.map(([label,w,h])=><button key={label} type="button" className="studio-tool" onClick={()=>setSize(w,h)}><strong>{label}</strong><small>{w} × {h} px</small></button>)}</div>}
     {tool==='style'&&<><p className="hint">Choose a starting background, then drag and style objects as you like.</p><div className="studio-v2-swatches">{['#FFF3DD','#E8D0B2','#FDE5C8','#F7F2E8','#D9E8EF','#F7DFE6','#E9ECEF','#523D37'].map(c=><button key={c} aria-label={`Background ${c}`} style={{backgroundColor:c}} onClick={()=>edit(d=>({...d,canvas:{...d.canvas,background:c}}))}/>)}</div><Field label="Exact background color"><input type="color" value={doc.canvas.background} onChange={e=>edit(d=>({...d,canvas:{...d.canvas,background:e.target.value}}))}/></Field></>}
     {tool==='elements'&&<><strong className="hint">Shapes</strong><div className="studio-v2-element-grid">{shapes.map(k=><button key={k} onClick={()=>add(k)}>{PALETTE[k].title}</button>)}</div><strong className="hint">Objects</strong><div className="studio-v2-element-grid">{(['card','badge','button','table','sticker'] as NodeKind[]).map(k=><button key={k} onClick={()=>add(k)}>{PALETTE[k].title}</button>)}</div></>}
     {tool==='photos'&&<><div className="studio-v2-mini-tabs"><button className={photoTab==='upload'?'active':''} onClick={()=>setPhotoTab('upload')}>Upload</button><button className={photoTab==='r2'?'active':''} onClick={()=>setPhotoTab('r2')}>R2 media</button><button className={photoTab==='drive'?'active':''} onClick={()=>setPhotoTab('drive')}>Google Drive</button></div>{photoTab==='upload'?<><p className="hint">Files stay on this browser for up to 7 days in the local draft; they are not published or saved to Supabase.</p><label className="studio-file-import">+ Import image from device<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void addImage(file);e.currentTarget.value='';}}/></label></>:<p className="hint">{photoTab==='r2'?'R2 library browser requires an authenticated media-catalog API; the storage endpoint alone cannot safely list private assets.':'Google Drive picker requires a reviewed owner-authorized OAuth broker. It is not yet connected to this editor.'} Use Upload for now.</p>}</>}
     {tool==='branding'&&<><p className="hint">Use a placeholder sticker and replace it with approved Study0SG artwork before publishing.</p><div className="studio-v2-element-grid">{['🐾','✦','♥','★','🍯','📚'].map(e=><button key={e} onClick={()=>{add('sticker');edit(d=>({...d,nodes:d.nodes.map((n,i)=>i===d.nodes.length-1?{...n,text:e}:n)}));}}>{e}</button>)}</div></>}
     {tool==='text'&&<><p className="hint">Add a text box, then select it to change font size, color and placement. More effects need Fabric.js integration later.</p><div className="studio-tool-list">{(['heading','text','badge'] as NodeKind[]).map(k=><button className="studio-tool" key={k} onClick={()=>add(k)}>+ {PALETTE[k].title}</button>)}</div></>}
     {tool==='ai'&&<div className="studio-tool-list"><p className="hint">Budgeted fal.ai illustration drafts. 5 per organizer and 20 across Study0SG per UTC day, if the media function is installed. No automatic publishing or R2 storage.</p><Field label="Describe artwork (no private student data)"><textarea minLength={10} maxLength={450} rows={5} value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder="Gentle pastel honey-badger learning corner with notebooks and leaves"/></Field><button type="button" disabled={aiBusy||aiPrompt.trim().length<10} onClick={()=>void generateImage()}>{aiBusy?'Generating…':'✦ Generate preview'}</button>{aiImage&&<div className="studio-ai-preview"><img src={aiImage} alt="AI-generated media illustration preview" referrerPolicy="no-referrer"/><a target="_blank" rel="noopener noreferrer" href={aiImage}>Open image to save</a></div>}{aiStatus&&<p className="hint">{aiStatus}</p>}</div>}
     {tool==='layers'&&<div className="studio-layers">{[...doc.nodes].reverse().map(n=><button key={n.id} className={`studio-layer ${selection===n.id?'selected':''}`} onClick={()=>{setSelection(n.id);setShowProperties(true);}}>{n.kind} · {(n.text||'shape').slice(0,19)}</button>)}</div>}
    </aside>}
    <div className="studio-v2-viewport"><div className="studio-v2-artboard"><StudioCanvas doc={doc} edit={edit} record={record} selection={selection} setSelection={id=>{setSelection(id);if(id)setShowProperties(true);}} mode="poster"/></div></div>
    {showProperties&&<aside className="studio-v2-inspector"><div className="record-actions"><strong>Properties</strong><button className="secondary-button" onClick={()=>setShowProperties(false)}>✕</button></div><PropertiesPanel node={current} edit={change} remove={remove} raise={()=>layer(1)} lower={()=>layer(-1)} mode="poster" addImage={addImage}/></aside>}
  </div>
  <div className="studio-v2-bottom"><span>Tap a tool to open its popover · drag objects to move · orange handle to resize</span><div className="record-actions"><button type="button" className="secondary-button" onClick={()=>setShowProperties(v=>!v)}>⚙ Inspector</button><button className="secondary-button" onClick={()=>setShowCollab(v=>!v)}>♧ Collaborators</button><button className="secondary-button" onClick={review}>Export review request</button><button className="secondary-button" onClick={()=>{void clearLocalDraft('edm').then(()=>setDeviceNote('Device copy cleared. Export your work before closing this page.')).catch(()=>setError('Could not clear this browser cache.'));}}>Delete device draft</button></div></div>
  {showCollab&&<div className="studio-v2-share"><CollaborationPanel {...collab} save={save}/></div>}
  <details className="studio-v2-saved"><summary>Saved shared poster layouts ({stored.data.filter(s=>s.kind==='edm').length})</summary><div className="record-list">{stored.data.filter(s=>s.kind==='edm').map(s=><article className="record-card" key={s.id}><strong>{s.title}</strong><p>{new Date(s.updated_at).toLocaleDateString('en-SG')}</p><button type="button" onClick={()=>activate(s)}>Open layout</button></article>)}</div><label className="studio-file-import">Import editable poster JSON<input type="file" accept="application/json,.json" onChange={e=>{const f=e.target.files?.[0];if(f)void importJSON(f);e.currentTarget.value='';}}/></label></details>
  <p className="muted-note">The SVG canvas supports dragging, editing and exports. Team saves use revision checks, not live CRDT merging. Fabric.js, Yjs, Dexie, Workbox and Piscina require further backend/dependency work. Photos remain device-only and are removed by TTL on next cache access.</p>
 </section>;
 // Fullscreen is portalled above the dashboard, but the editor stays mounted.
 return fullscreen ? createPortal(studio,document.body) : studio;
}
