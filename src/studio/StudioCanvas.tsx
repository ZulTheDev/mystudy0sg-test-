import {useEffect,useRef,useState,type PointerEvent as ReactPointerEvent,type KeyboardEvent as ReactKeyboardEvent} from 'react';
import {getSnapper,type Snapper} from './snap';
import {clamp,PALETTE,type CanvasNode,type NodeKind,type StudioDocument} from './model';

export type EditDocument=(update:(old:StudioDocument)=>StudioDocument,remember?:boolean)=>void;
type Props={doc:StudioDocument;edit:EditDocument;record:(before:StudioDocument)=>void;selection:string|null;setSelection:(id:string|null)=>void;mode:'wireframe'|'poster';readOnly?:boolean;hiddenIds?:Set<string>;onNodeAction?:(node:CanvasNode)=>void};
type Drag={pointerId:number;id:string;kind:'move'|'resize';start:{x:number;y:number};initial:CanvasNode;before:StudioDocument;changed:boolean};
const GRID=12;
const nodeText=(node:CanvasNode)=>node.text.slice(0,800);
export function StudioCanvas({doc,edit,record,selection,setSelection,mode,readOnly=false,hiddenIds,onNodeAction}:Props){
 const svgRef=useRef<SVGSVGElement>(null);
 const drag=useRef<Drag|null>(null);
 const snapper=useRef<Snapper>((v,step)=>Math.round(v/step)*step);
 const frame=useRef<number|null>(null);
 const pending=useRef<{point:{x:number;y:number};pointerId:number}|null>(null);
 const [grid,setGrid]=useState(true);
 const [snap,setSnap]=useState(true);
 const [zoom,setZoom]=useState(100);
 useEffect(()=>{let active=true;void getSnapper().then(fn=>{if(active)snapper.current=fn;});return()=>{active=false;if(frame.current!==null)window.cancelAnimationFrame(frame.current);};},[]);
 const getPoint=(event:ReactPointerEvent<SVGSVGElement>)=>{
  const inverse=svgRef.current?.getScreenCTM()?.inverse();
  if(!inverse)return null;
  const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(inverse);
  return {x:p.x,y:p.y};
 };
 const start=(event:ReactPointerEvent<SVGGElement>,node:CanvasNode,kind:'move'|'resize')=>{
  if(readOnly)return;
  const position=getPoint(event as unknown as ReactPointerEvent<SVGSVGElement>);if(!position)return;
  event.stopPropagation();event.preventDefault();
  setSelection(node.id);
  drag.current={pointerId:event.pointerId,id:node.id,kind,start:position,initial:node,before:doc,changed:false};
  svgRef.current?.setPointerCapture(event.pointerId);
 };
 const paintMove=(p:{x:number;y:number},pointerId:number)=>{
  const d=drag.current;if(!d||d.pointerId!==pointerId||readOnly)return;
  const dx=p.x-d.start.x,dy=p.y-d.start.y;
  const n=d.initial,step=snap?GRID:1;
  const gridPos=(value:number)=>snap? snapper.current(Math.round(value),step):Math.round(value);
  const next=d.kind==='move'
   ?{...n,x:clamp(gridPos(n.x+dx),0,doc.canvas.width-n.w),y:clamp(gridPos(n.y+dy),0,doc.canvas.height-n.h)}
   :{...n,w:clamp(gridPos(n.w+dx),36,doc.canvas.width-n.x),h:clamp(gridPos(n.h+dy),28,doc.canvas.height-n.y)};
  if(next.x===n.x&&next.y===n.y&&next.w===n.w&&next.h===n.h)return;
  d.changed=true;
  edit(old=>({...old,nodes:old.nodes.map(v=>v.id===n.id?next:v)}),false);
 };
 const move=(event:ReactPointerEvent<SVGSVGElement>)=>{
  if(!drag.current||drag.current.pointerId!==event.pointerId)return;
  const point=getPoint(event);if(!point)return;
  pending.current={point,pointerId:event.pointerId};
  if(frame.current===null)frame.current=window.requestAnimationFrame(()=>{frame.current=null;const latest=pending.current;pending.current=null;if(latest)paintMove(latest.point,latest.pointerId);});
 };
 const stop=(event:ReactPointerEvent<SVGSVGElement>)=>{
  const d=drag.current;if(!d||d.pointerId!==event.pointerId)return;
  if(frame.current!==null){window.cancelAnimationFrame(frame.current);frame.current=null;}
  const last=pending.current;pending.current=null;if(last)paintMove(last.point,last.pointerId);
  if(d.changed)record(d.before);
  drag.current=null;
  if(svgRef.current?.hasPointerCapture(event.pointerId))svgRef.current.releasePointerCapture(event.pointerId);
 };
 const key=(event:ReactKeyboardEvent<SVGSVGElement>)=>{
  if(readOnly||!selection||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
  event.preventDefault();const step=event.shiftKey?10:1;
  const dx=event.key==='ArrowLeft'?-step:event.key==='ArrowRight'?step:0;
  const dy=event.key==='ArrowUp'?-step:event.key==='ArrowDown'?step:0;
  edit(old=>({...old,nodes:old.nodes.map(n=>n.id===selection?{...n,x:clamp(n.x+dx,0,old.canvas.width-n.w),y:clamp(n.y+dy,0,old.canvas.height-n.h)}:n)}));
 };
 return <div className="studio-canvas-wrap">
  {!readOnly&&<div className="studio-canvas-actions">
    <label><input type="checkbox" checked={grid} onChange={e=>setGrid(e.target.checked)}/> Grid</label>
    <label><input type="checkbox" checked={snap} onChange={e=>setSnap(e.target.checked)}/> Snap to grid</label>
    <label>Zoom <select value={zoom} onChange={e=>setZoom(Number(e.target.value))}><option value="50">50%</option><option value="75">75%</option><option value="100">100%</option><option value="125">125%</option></select></label>
    <span className="hint">Drag objects · corner to resize · arrows to nudge</span>
  </div>}
  <div className="studio-canvas-scroll">
   <svg ref={svgRef} viewBox={`0 0 ${doc.canvas.width} ${doc.canvas.height}`} width={`${zoom}%`} style={{minWidth:readOnly?'100%':'min(100%, 520px)',maxWidth:readOnly?'100%':`${Math.round(doc.canvas.width*1.25)}px`,touchAction:'none'}} className="studio-canvas" aria-label={`${mode==='poster'?'Poster':'Page'} visual editor`} role="group" tabIndex={readOnly?-1:0} onKeyDown={key} onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onPointerDown={e=>{if(e.target===e.currentTarget&&!readOnly)setSelection(null);}}>
    <defs><pattern id={`studio-grid-${mode}`} width={GRID} height={GRID} patternUnits="userSpaceOnUse"><path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke="#9a7b5833" strokeWidth=".8"/></pattern></defs>
    <rect width="100%" height="100%" fill={doc.canvas.background} onPointerDown={()=>{if(!readOnly)setSelection(null);}}/>
    {grid&&!readOnly&&<rect width="100%" height="100%" fill={`url(#studio-grid-${mode})`} pointerEvents="none"/>}
    {(doc.connections??[]).map((edge,index)=>{const from=doc.nodes.find(n=>n.id===edge.from),to=doc.nodes.find(n=>n.id===edge.to);if(!from||!to)return null;return <g key={`${edge.from}-${edge.to}-${index}`} pointerEvents="none"><line x1={from.x+from.w/2} y1={from.y+from.h/2} x2={to.x+to.w/2} y2={to.y+to.h/2} stroke="#8c5e3a" strokeWidth={3} strokeDasharray="7 5"/><text x={(from.x+from.w/2+to.x+to.w/2)/2} y={(from.y+from.h/2+to.y+to.h/2)/2-9} fontSize={13} textAnchor="middle" fill="#714f30">{edge.label}</text></g>})}
    {doc.nodes.filter(n=>!hiddenIds?.has(n.id)).map(n=>{
     const active=!readOnly&&n.id===selection;
     const font=Math.max(12,Math.min(110,n.fontSize));
     const lines=nodeText(n).split('\n').flatMap(line=>{
      const maxChars=Math.max(7,Math.floor(n.w/(font*.57)));
      return line.length<=maxChars?[line]:(line.match(new RegExp(`.{1,${maxChars}}`,'g'))||['']);
     }).slice(0,Math.max(1,Math.floor(n.h/(font*1.3))));
     const textProps={fontFamily:'Arial, sans-serif',fontSize:font,fill:n.color};
     return <g key={n.id} opacity={n.opacity} onPointerDown={e=>{start(e,n,'move');}} onDoubleClick={()=>{if(readOnly)onNodeAction?.(n);}} style={{cursor:readOnly?'default':'move'}} aria-label={`${PALETTE[n.kind].title}: ${nodeText(n).slice(0,50)}`}>
      {n.kind==='circle'?<ellipse cx={n.x+n.w/2} cy={n.y+n.h/2} rx={n.w/2} ry={n.h/2} fill={n.fill}/>
      :n.kind==='image'?n.src?<><rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.radius} fill="#e9e4dd"/><image href={n.src} x={n.x} y={n.y} width={n.w} height={n.h} preserveAspectRatio="xMidYMid slice"/></>:<><rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.radius} fill="#eee8e0" stroke="#bca58d" strokeDasharray="7 5"/><text x={n.x+14} y={n.y+35} fontSize="18" fill="#66554a">Add an image</text></>
      :n.kind==='sticker'?null
      :<rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.kind==='rectangle'?n.radius:n.kind==='button'||n.kind==='badge'?14:n.kind==='card'?n.radius:4} fill={['heading','text','link'].includes(n.kind)?'transparent':n.fill} stroke={n.kind==='input'||n.kind==='card'||n.kind==='table'?'#b6a18d':'none'} strokeWidth="2"/>}
      {n.kind==='table'&&<><path d={`M${n.x} ${n.y+Math.min(n.h/3,45)} H${n.x+n.w} M${n.x+n.w/2} ${n.y} V${n.y+n.h}`} stroke="#d0b69a" strokeWidth="2"/></>}
      {!['circle','rectangle','image'].includes(n.kind)&&<text {...textProps} fontWeight={['heading','button','badge'].includes(n.kind)?700:400} textAnchor={n.kind==='sticker'||n.kind==='button'||n.kind==='badge'?'middle':'start'}>
       {lines.map((line,index)=><tspan key={index} x={n.kind==='sticker'||n.kind==='button'||n.kind==='badge'?n.x+n.w/2:n.x+Math.min(16,n.w/12)} y={n.kind==='sticker'||n.kind==='button'||n.kind==='badge'?n.y+n.h/2+(index-(lines.length-1)/2)*font*1.17+font*.35:n.y+Math.min(font+10,n.h/2)+(index*font*1.17)}>{line}</tspan>)}
      </text>}
      {active&&<><rect x={n.x-3} y={n.y-3} width={n.w+6} height={n.h+6} fill="none" stroke="#df7920" strokeWidth="3" strokeDasharray="7 3" pointerEvents="none"/><g onPointerDown={e=>start(e,n,'resize')} style={{cursor:'nwse-resize'}}><rect x={n.x+n.w-10} y={n.y+n.h-10} width="21" height="21" fill="#d77517" stroke="#fff" strokeWidth="3" rx="4"/></g></>}
      {readOnly&&onNodeAction&&['button','link'].includes(n.kind)&&<rect x={n.x} y={n.y} width={n.w} height={n.h} fill="transparent" role="button" tabIndex={0} onClick={()=>onNodeAction(n)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')onNodeAction(n);}} style={{cursor:'pointer'}}/>}
     </g>;
    })}
   </svg>
  </div>
 </div>;
}

export function PropertiesPanel({node,edit,remove,raise,lower,mode,addImage}: {node:CanvasNode|null;edit:(patch:Partial<CanvasNode>)=>void;remove:()=>void;raise:()=>void;lower:()=>void;mode:'wireframe'|'poster';addImage?:(file:File)=>void}){
 if(!node)return <div className="studio-properties"><h3>Object settings</h3><p className="hint">Select an object on the canvas to edit its position, size, colors, and text.</p></div>;
 const integer=(value:string,fallback:number)=>Number.isFinite(Number(value))?Number(value):fallback;
 return <div className="studio-properties"><h3>{PALETTE[node.kind].title} settings</h3>
  {!['rectangle','circle','image'].includes(node.kind)&&<label>Text<textarea rows={3} value={node.text} maxLength={800} onChange={e=>edit({text:e.target.value})}/></label>}
  {node.kind==='image'&&addImage&&<label>Choose photo (PNG, JPG, WebP; max 450 KB)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.currentTarget.files?.[0];if(f)addImage(f);e.currentTarget.value='';}}/></label>}
  <div className="studio-property-grid">{(['x','y','w','h'] as const).map(k=><label key={k}>{({x:'Left',y:'Top',w:'Width',h:'Height'})[k]}<input type="number" min="0" max="1200" value={Math.round(node[k])} onChange={e=>edit({[k]:integer(e.target.value,node[k])})}/></label>)}</div>
  <div className="studio-property-grid"><label>Fill<input type="color" value={node.fill} onChange={e=>edit({fill:e.target.value})}/></label><label>Text color<input type="color" value={node.color} onChange={e=>edit({color:e.target.value})}/></label><label>Font size<input type="number" min="10" max="110" value={node.fontSize} onChange={e=>edit({fontSize:integer(e.target.value,node.fontSize)})}/></label><label>Opacity<input type="range" min="0.1" max="1" step="0.05" value={node.opacity} onChange={e=>edit({opacity:Number(e.target.value)})}/></label></div>
  <div className="record-actions"><button className="secondary-button" type="button" onClick={raise}>Bring forward</button><button className="secondary-button" type="button" onClick={lower}>Send backward</button><button className="danger-button" type="button" onClick={remove}>Delete object</button></div>
  {mode==='wireframe'&&<p className="hint">To make a button work, add a logic block below the canvas.</p>}
 </div>;
}
