import {xmlEscape,downloadText} from '../v14-utils';
import type {CanvasNode,StudioDocument} from './model';
const safeNum=(n:number)=>Number.isFinite(n)?Math.round(n*10)/10:0;
const lineBreak=(value:string,width:number,fontSize:number)=>value.split('\n').flatMap(s=>{
 const maxChars=Math.max(7,Math.floor(width/(fontSize*.57)));
 return s.length<=maxChars?[s]:s.match(new RegExp(`.{1,${maxChars}}`,'g'))||[''];
});
function nodeToSvg(n:CanvasNode):string{
 const x=safeNum(n.x),y=safeNum(n.y),w=safeNum(n.w),h=safeNum(n.h),font=safeNum(n.fontSize),opacity=safeNum(n.opacity);
 const fill=n.fill,color=n.color;
 const shape=n.kind==='circle'?`<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}" fill="${fill}"/>`
 :n.kind==='image'?n.src?`<image x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" href="${n.src}"/>`:`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#eee8e0"/>`
 :n.kind==='sticker'?'':`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${safeNum(n.radius)}" fill="${['heading','text','link'].includes(n.kind)?'none':fill}" ${['input','card','table'].includes(n.kind)?'stroke="#b6a18d"':''}/>`;
 const table=n.kind==='table'?`<path d="M${x} ${y+Math.min(h/3,45)} H${x+w} M${x+w/2} ${y} V${y+h}" stroke="#d0b69a" stroke-width="2"/>`:'';
 const centered=['sticker','button','badge'].includes(n.kind);
 const lines=['rectangle','circle','image'].includes(n.kind)?[]:lineBreak(n.text,w,font).slice(0,Math.max(1,Math.floor(h/(font*1.3))));
 const text=lines.length?`<text fill="${color}" font-family="Arial, sans-serif" font-size="${font}" font-weight="${['heading','button','badge'].includes(n.kind)?'bold':'normal'}" text-anchor="${centered?'middle':'start'}">${lines.map((s,i)=>`<tspan x="${centered?x+w/2:x+Math.min(16,w/12)}" y="${centered?y+h/2+(i-(lines.length-1)/2)*font*1.17+font*.35:y+Math.min(font+10,h/2)+i*font*1.17}">${xmlEscape(s)}</tspan>`).join('')}</text>`:'';
 return `<g opacity="${opacity}">${shape}${table}${text}</g>`;
}
export function toSvg(doc:StudioDocument):string{
 return `<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${doc.canvas.width}" height="${doc.canvas.height}" viewBox="0 0 ${doc.canvas.width} ${doc.canvas.height}" role="img"><title>Study0SG exported design</title><rect width="100%" height="100%" fill="${doc.canvas.background}"/>${(doc.connections??[]).map(e=>{const a=doc.nodes.find(n=>n.id===e.from),b=doc.nodes.find(n=>n.id===e.to);return a&&b?`<line x1=\"${safeNum(a.x+a.w/2)}\" y1=\"${safeNum(a.y+a.h/2)}\" x2=\"${safeNum(b.x+b.w/2)}\" y2=\"${safeNum(b.y+b.h/2)}\" stroke=\"#805934\" stroke-width=\"3\"/>`:''}).join('')}${doc.nodes.map(nodeToSvg).join('')}</svg>`;
}
export function exportSVG(doc:StudioDocument,filename='Study0SG-design.svg'){
 downloadText(filename,toSvg(doc),'image/svg+xml;charset=utf-8');
}
/** Exports PNG locally, no external upload. Does not execute script in imported images. */
export async function exportPNG(doc:StudioDocument):Promise<void>{
 const blob=new Blob([toSvg(doc)],{type:'image/svg+xml'}),uri=URL.createObjectURL(blob);
 try{
  const img=new Image();img.src=uri;
  await img.decode();
  const canvas=document.createElement('canvas');canvas.width=doc.canvas.width*2;canvas.height=doc.canvas.height*2;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas is unavailable');
  ctx.drawImage(img,0,0,canvas.width,canvas.height);
  const output=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
  if(!output)throw Error('Cannot export poster as PNG');
  const download=URL.createObjectURL(output);const a=document.createElement('a');a.href=download;a.download='Study0SG-poster.png';a.click();window.setTimeout(()=>URL.revokeObjectURL(download),1200);
 }finally{URL.revokeObjectURL(uri);}
}
/** React component is generated from a structured design schema, never from arbitrary JS. */
export function toReactSource(title:string,doc:StudioDocument):string{
 const noPhotos={...doc,nodes:doc.nodes.map(n=>n.src?{...n,src:undefined}:n)};
 const notes=doc.services.join(', ')||'None selected';
 return `/* Study0SG visual-to-code export.
 * Purpose: ${doc.explanation.replaceAll('*/','').replaceAll('\n',' ').slice(0,180)}
 * Planned backend services: ${notes.replaceAll('*/','').slice(0,200)}
 * What this DOES: draws a responsive visual approximation and runs simple, approved interactions.
 * What this DOES NOT: implement database APIs, authentication, form submissions, or security.
 * Review and test accessibility, routing, data validation, and permissions before using in production.
 * Local photo files are intentionally excluded; add reviewed assets through your website pipeline.
 */
import React, { useEffect, useState } from 'react';

type Item = {id:string;kind:string;x:number;y:number;w:number;h:number;text:string;fill:string;color:string;fontSize:number;radius:number;opacity:number;src?:string};
type Rule = {id:string;event:'click'|'load';sourceId:string;action:'show-message'|'toggle'|'set-text'|'open-link';targetId:string;value:string};
const model = ${JSON.stringify(noPhotos,null,2)} as {canvas:{width:number;height:number;background:string};nodes:Item[];logic:Rule[]};

export default function DesignedPage() {
 const [hidden,setHidden] = useState<string[]>([]);
 const [overrides,setOverrides] = useState<Record<string,string>>({});
 const [notice,setNotice] = useState('');
 const execute = (event:'click'|'load', source:string) => {
  model.logic.filter(r => r.event===event && r.sourceId===source).forEach(rule => {
   if(rule.action==='show-message')setNotice(rule.value.slice(0,280));
   if(rule.action==='toggle')setHidden(old => old.includes(rule.targetId)?old.filter(x=>x!==rule.targetId):[...old,rule.targetId]);
   if(rule.action==='set-text')setOverrides(old => ({...old,[rule.targetId]:rule.value.slice(0,800)}));
   if(rule.action==='open-link'){
    try { const u = new URL(rule.value); if(u.protocol==='https:')window.open(u.href,'_blank','noopener,noreferrer'); }catch{ /* invalid URL */ }
   }
  });
 };
 useEffect(() => {execute('load','page');},[]);
 return <main aria-label=${JSON.stringify(title)} style={{maxWidth:model.canvas.width,margin:'auto'}}>
  <div style={{position:'relative',width:'100%',aspectRatio:${JSON.stringify(`${doc.canvas.width} / ${doc.canvas.height}`)},background:model.canvas.background,overflow:'hidden',borderRadius:12}}>
   {model.nodes.filter(item=>!hidden.includes(item.id)).map(item=>{
    const style:React.CSSProperties={position:'absolute',left:(item.x/model.canvas.width*100)+'%',top:(item.y/model.canvas.height*100)+'%',width:(item.w/model.canvas.width*100)+'%',height:(item.h/model.canvas.height*100)+'%',background:['heading','text','link'].includes(item.kind)?'transparent':item.fill,color:item.color,fontSize:'clamp(12px, 2vw, '+item.fontSize+'px)',borderRadius:item.radius,opacity:item.opacity,padding:8,overflow:'hidden',boxSizing:'border-box'};
    const text=overrides[item.id]??item.text;
    if(item.kind==='button')return <button key={item.id} type="button" style={style} onClick={()=>execute('click',item.id)}>{text}</button>;
    if(item.kind==='input')return <label key={item.id} style={style}>{text}<input aria-label={text} style={{width:'100%'}} /></label>;
    if(item.kind==='heading')return <h1 key={item.id} style={style}>{text}</h1>;
    if(item.kind==='link')return <button key={item.id} type="button" style={style} onClick={()=>execute('click',item.id)}>{text}</button>;
    if(item.kind==='circle')return <div key={item.id} style={{...style,borderRadius:'50%'}}/>;
    if(item.kind==='rectangle')return <div key={item.id} style={style}/>;
    if(item.kind==='image')return <div key={item.id} style={style} aria-label="Image placeholder">Image placeholder</div>;
    return <div key={item.id} style={style}>{text}</div>;
   })}
  </div>
  {notice && <p role="status">{notice}</p>}
 </main>;
}
`;
}
