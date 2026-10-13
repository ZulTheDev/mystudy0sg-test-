import {useEffect,useState} from 'react';
import {MAX_ARTBOARD_SIZE,MIN_ARTBOARD_SIZE,resizeArtboard,type StudioDocument} from './model';
import type {EditDocument} from './StudioCanvas';

type Props={doc:StudioDocument;edit:EditDocument;compact?:boolean};

// Change the real document dimensions, not just the browser zoom.
export function ArtboardSizeControls({doc,edit,compact=false}:Props){
 const [width,setWidth]=useState(String(doc.canvas.width));
 const [height,setHeight]=useState(String(doc.canvas.height));
 useEffect(()=>{setWidth(String(doc.canvas.width));setHeight(String(doc.canvas.height));},[doc.canvas.width,doc.canvas.height]);
 const apply=()=>{
  const w=Number(width),h=Number(height);
  if(!Number.isSafeInteger(w)||!Number.isSafeInteger(h)||w<MIN_ARTBOARD_SIZE||h<MIN_ARTBOARD_SIZE||w>MAX_ARTBOARD_SIZE||h>MAX_ARTBOARD_SIZE)return;
  edit(d=>resizeArtboard(d,w,h));
 };
 const valid=[width,height].every(v=>/^[0-9]+$/.test(v)&&Number(v)>=MIN_ARTBOARD_SIZE&&Number(v)<=MAX_ARTBOARD_SIZE);
 return <div className={`studio-artboard-size ${compact?'compact':''}`} role="group" aria-label="Artboard size in pixels">
  <label>W <input aria-label="Artboard width in pixels" type="number" min={MIN_ARTBOARD_SIZE} max={MAX_ARTBOARD_SIZE} step="1" value={width} onChange={e=>setWidth(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')apply();}}/></label>
  <span aria-hidden="true">×</span>
  <label>H <input aria-label="Artboard height in pixels" type="number" min={MIN_ARTBOARD_SIZE} max={MAX_ARTBOARD_SIZE} step="1" value={height} onChange={e=>setHeight(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')apply();}}/></label>
  <button className="secondary-button" type="button" disabled={!valid} onClick={apply}>Apply size</button>
  <button className="secondary-button" type="button" onClick={()=>edit(d=>resizeArtboard(d,d.canvas.height,d.canvas.width))} title="Swap width and height">⇄</button>
 </div>;
}
