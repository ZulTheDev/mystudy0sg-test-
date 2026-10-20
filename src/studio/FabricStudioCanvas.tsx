import {useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {Canvas,Ellipse,FabricImage,Group,Rect,Textbox,type FabricObject} from 'fabric';
import {clamp,type CanvasNode,type StudioDocument} from './model';
import type {EditDocument} from './StudioCanvas';

type Props={doc:StudioDocument;edit:EditDocument;record:(before:StudioDocument)=>void;selection:string|null;setSelection:(id:string|null)=>void;mode:'wireframe'|'poster';readOnly?:boolean;hiddenIds?:Set<string>;onNodeAction?:(n:CanvasNode)=>void};
type Named=FabricObject&{nodeId?:string};
const presets=[['Square',1080,1080],['Presentation',1280,720],['Mobile',390,844],['Desktop',1440,900]] as const;

// Fabric owns the interactive canvas. Study0SG's JSON remains the saved file format.
export function FabricStudioCanvas({doc,edit,record,selection,setSelection,mode,readOnly=false,hiddenIds}:Props){
 const canvasEl=useRef<HTMLCanvasElement>(null),editor=useRef<Canvas|null>(null),outer=useRef<HTMLDivElement>(null);
 const [zoom,setZoom]=useState<'fit'|'50'|'75'|'100'|'125'|'150'>('fit'),[stageWidth,setStageWidth]=useState(1080);
 const [grid,setGrid]=useState(false),[snap,setSnap]=useState(true);
 const skipDraw=useRef(false),docRef=useRef(doc),sizeDrag=useRef<{startX:number;startY:number;before:StudioDocument}|null>(null);
 docRef.current=doc;
 const scale=useMemo(()=>zoom==='fit'?clamp((stageWidth-72)/doc.canvas.width,.2,1.5):Number(zoom)/100,[zoom,stageWidth,doc.canvas.width]);
 useEffect(()=>{
  const element=outer.current;if(!element)return;
  const observer=new ResizeObserver(()=>setStageWidth(element.clientWidth));
  observer.observe(element);setStageWidth(element.clientWidth);
  return()=>observer.disconnect();
 },[]);
 useEffect(()=>{
  if(!canvasEl.current)return;
  const fabric=new Canvas(canvasEl.current,{width:docRef.current.canvas.width,height:docRef.current.canvas.height,selection:!readOnly,preserveObjectStacking:true});
  editor.current=fabric;
  const changed=(evt:{target?:FabricObject})=>{
   const target=evt.target as Named|undefined;if(!target?.nodeId||readOnly)return;
   const id=target.nodeId;
   const x=Math.round(target.left||0),y=Math.round(target.top||0);
   const w=Math.max(24,Math.round(target.getScaledWidth())),h=Math.max(24,Math.round(target.getScaledHeight()));
   skipDraw.current=true;
   edit(old=>({...old,nodes:old.nodes.map(n=>n.id===id?{...n,x:clamp(snap?Math.round(x/12)*12:x,0,old.canvas.width-24),y:clamp(snap?Math.round(y/12)*12:y,0,old.canvas.height-24),w,h}:n)}));
  };
  const selected=(e:{selected?:FabricObject[]})=>{const id=(e.selected?.[0] as Named|undefined)?.nodeId;if(id)setSelection(id);};
  fabric.on('object:modified',changed);
  fabric.on('selection:created',selected);fabric.on('selection:updated',selected);
  fabric.on('selection:cleared',()=>setSelection(null));
  return()=>{editor.current=null;void fabric.dispose();};
 // One Fabric canvas per mounted editor; state updates never recreate it.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[readOnly,mode]);
 const signature=JSON.stringify({nodes:doc.nodes,canvas:doc.canvas,hidden:[...(hiddenIds||[])]});
 useEffect(()=>{
  const fabric=editor.current;if(!fabric)return;
  if(skipDraw.current){skipDraw.current=false;return;}
  let cancelled=false;fabric.clear();fabric.backgroundColor=doc.canvas.background;
  async function paintNode(n:CanvasNode):Promise<Named>{
   let object:Named;
   if(n.kind==='circle')object=new Ellipse({left:n.x,top:n.y,rx:n.w/2,ry:n.h/2,fill:n.fill,opacity:n.opacity}) as Named;
   else if(n.kind==='image'&&n.src){
    try{const img=await FabricImage.fromURL(n.src,{crossOrigin:'anonymous'});
     img.set({left:n.x,top:n.y,scaleX:n.w/(img.width||1),scaleY:n.h/(img.height||1),opacity:n.opacity});object=img as Named;}
    catch{object=new Rect({left:n.x,top:n.y,width:n.w,height:n.h,fill:'#e8ded2'}) as Named;}
   }
   else if(n.kind==='rectangle'||n.kind==='image'){
    object=new Rect({left:n.x,top:n.y,width:n.w,height:n.h,fill:n.fill,rx:n.radius,ry:n.radius,opacity:n.opacity}) as Named;
   }else{
    const label=new Textbox(n.text,{left:0,top:0,width:Math.max(24,n.w-12),fontFamily:'Arial',fontSize:n.fontSize,fill:n.color,splitByGrapheme:false});
    if(['frame','card','badge','button','input'].includes(n.kind)){
     const bg=new Rect({left:0,top:0,width:n.w,height:n.h,fill:n.fill,rx:n.radius,ry:n.radius,stroke:n.kind==='frame'?'#ff951c':undefined,strokeWidth:n.kind==='frame'?2:0});
     label.set({left:Math.min(12,n.w/8),top:Math.min(12,n.h/8)});
     object=new Group([bg,label],{left:n.x,top:n.y,opacity:n.opacity}) as Named;
    }else {label.set({left:n.x,top:n.y,opacity:n.opacity});object=label as Named;}
   }
   object.nodeId=n.id;object.set({selectable:!readOnly,evented:!readOnly,lockRotation:true,cornerColor:'#ff951c',borderColor:'#ff951c'});
   return object;
  }
  void (async()=>{
   for(const n of doc.nodes.filter(x=>!hiddenIds?.has(x.id))){
    const obj=await paintNode(n);
    if(cancelled)return;
    fabric.add(obj);
   }
   if(!cancelled){const chosen=fabric.getObjects().find(x=>(x as Named).nodeId===selection);if(chosen&&!readOnly)fabric.setActiveObject(chosen);fabric.requestRenderAll();}
  })();
  return()=>{cancelled=true;};
 // signature tracks model values and external collaborative resets.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[signature,readOnly]);
 useEffect(()=>{
  const fabric=editor.current;if(!fabric)return;
  fabric.setDimensions({width:doc.canvas.width*scale,height:doc.canvas.height*scale});
  fabric.setViewportTransform([scale,0,0,scale,0,0]);
  fabric.requestRenderAll();
 },[doc.canvas.width,doc.canvas.height,scale]);
 const dimensions=(w:number,h:number)=>edit(old=>({...old,canvas:{...old.canvas,width:clamp(Math.round(w),320,2400),height:clamp(Math.round(h),320,2400)}}));
 const dragStart=(e:ReactPointerEvent<HTMLButtonElement>)=>{if(readOnly)return;sizeDrag.current={startX:e.clientX,startY:e.clientY,before:doc};e.currentTarget.setPointerCapture(e.pointerId);};
 const dragMove=(e:ReactPointerEvent<HTMLButtonElement>)=>{const data=sizeDrag.current;if(!data)return;dimensions(data.before.canvas.width+(e.clientX-data.startX)/scale,data.before.canvas.height+(e.clientY-data.startY)/scale);};
 const dragEnd=()=>{if(sizeDrag.current){record(sizeDrag.current.before);sizeDrag.current=null;}};
 return <div className="fabric-workspace" ref={outer}>
  {!readOnly&&<div className="fabric-controls">
   <label>Artboard <select aria-label="Artboard size preset" value="" onChange={e=>{const p=presets.find(x=>x[0]===e.target.value);if(p)dimensions(p[1],p[2]);}}><option value="">Custom size</option>{presets.map(p=><option key={p[0]} value={p[0]}>{p[0]}</option>)}</select></label>
   <label>W <input aria-label="Artboard width" type="number" min={320} max={2400} value={doc.canvas.width} onChange={e=>dimensions(Number(e.target.value)||320,doc.canvas.height)}/></label>
   <label>H <input aria-label="Artboard height" type="number" min={320} max={2400} value={doc.canvas.height} onChange={e=>dimensions(doc.canvas.width,Number(e.target.value)||320)}/></label>
   <label>Zoom <select value={zoom} onChange={e=>setZoom(e.target.value as typeof zoom)}><option value="fit">Fit</option>{['50','75','100','125','150'].map(z=><option key={z} value={z}>{z}%</option>)}</select></label>
   <label><input type="checkbox" checked={grid} onChange={e=>setGrid(e.target.checked)}/> Grid</label>
   <label><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/> Snap</label>
   <span className="hint">Select an object, then drag its orange handles to resize.</span>
  </div>}
  <div className={'fabric-scroll'+(grid?' fabric-grid':'')} aria-label={mode==='poster'?'EDM artboard':'Wireframe artboard'}>
   <div className="fabric-board" style={{width:doc.canvas.width*scale,height:doc.canvas.height*scale}}>
    <canvas ref={canvasEl} aria-label="Interactive design canvas"/>
    {!readOnly&&<button className="fabric-resize" aria-label="Drag to resize artboard" title="Resize artboard" type="button" onPointerDown={dragStart} onPointerMove={dragMove} onPointerUp={dragEnd} onPointerCancel={dragEnd}>↘</button>}
   </div>
  </div>
 </div>;
}
