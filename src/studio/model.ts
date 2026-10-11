/** Study0SG design data has no executable JavaScript, HTML, or private participant records. */
export type NodeKind = 'heading'|'text'|'button'|'input'|'card'|'table'|'image'|'rectangle'|'circle'|'sticker'|'link'|'badge';
export type CanvasNode = {
 id:string; kind:NodeKind; x:number;y:number;w:number;h:number; text:string;
 fill:string; color:string; fontSize:number; radius:number; opacity:number;
 src?:string;
};
export type LogicEvent = 'click'|'load';
export type LogicAction = 'show-message'|'toggle'|'set-text'|'open-link';
export type LogicRule = {id:string;event:LogicEvent;sourceId:string; action:LogicAction; targetId:string; value:string};
export type StudioDocument = {connections?:Array<{from:string;to:string;label:string}>;version:2; canvas:{width:number;height:number;background:string}; nodes:CanvasNode[]; logic:LogicRule[]; services:string[]; explanation:string};
export const newId=()=>crypto.randomUUID();
export const PALETTE:Record<NodeKind,{title:string;hint:string;initial:string}>={
 heading:{title:'Heading',hint:'Big page title',initial:'Welcome to Study0SG'},
 text:{title:'Text',hint:'Paragraph or caption',initial:'Learn together, grow together.'},
 button:{title:'Button',hint:'An interactive action',initial:'Register interest'},
 input:{title:'Text box',hint:'Let people type',initial:'Your name'},
 card:{title:'Card',hint:'A neat content box',initial:'Upcoming learning event'},
 table:{title:'Table',hint:'Organize information',initial:'Example table'},
 image:{title:'Image',hint:'Photo or illustration',initial:'Image'},
 rectangle:{title:'Rectangle',hint:'Background shape',initial:''},
 circle:{title:'Circle',hint:'Round decoration',initial:''},
 sticker:{title:'Sticker',hint:'Fun accent shape',initial:'★'},
 link:{title:'Link',hint:'Text link',initial:'Learn more'},
 badge:{title:'Badge',hint:'Small status label',initial:'FREE EVENT'}
};
export const clamp=(v:number,min:number,max:number)=>Math.min(max,Math.max(min,v));
export const isColor=(value:string)=>/^#[0-9a-fA-F]{6}$/.test(value);
export function defaultNode(kind:NodeKind, count:number, mode:'wireframe'|'poster'):CanvasNode{
 const x=30+(count%5)*25,y=35+(count%6)*30;
 const isPoster=mode==='poster';
 const sizes:Partial<Record<NodeKind,[number,number]>>={heading:[isPoster?590:440,86],text:[isPoster?480:400,92],button:[240,66],input:[270,56],card:[300,138],table:[340,155],image:[270,200],rectangle:[220,150],circle:[130,130],sticker:[95,95],link:[220,48],badge:[190,52]};
 const [w,h]=sizes[kind]||[250,80];
 return {id:newId(),kind,x,y,w,h,text:PALETTE[kind].initial,fill:kind==='rectangle'?'#FFDBC4':kind==='circle'?'#F4B76B':kind==='button'?'#F28C28':kind==='card'?'#FFFDF8':kind==='badge'?'#FFDFBC':'#FFFFFF',color:'#553727',fontSize:kind==='heading'?(isPoster?52:40):kind==='sticker'?72:kind==='text'?22:22,radius:kind==='circle'?999:14,opacity:1};
}
export const starterWireframe=():StudioDocument=>({version:2,canvas:{width:960,height:600,background:'#fff9f0'},nodes:[
 {...defaultNode('heading',0,'wireframe'),x:80,y:70,text:'Welcome to Study0SG'},
 {...defaultNode('text',1,'wireframe'),x:80,y:175,text:'Explore our learning events with friendly volunteers.'},
 {...defaultNode('button',2,'wireframe'),x:80,y:310,text:'See upcoming events'},
 {...defaultNode('card',3,'wireframe'),x:600,y:100,w:290,h:280,text:'Events for every curious mind'}
 ],logic:[],services:['Website'],explanation:'Help students find Study0SG activities.'});
export const starterSecurity=():StudioDocument=>({version:2,canvas:{width:960,height:600,background:'#f3f7fb'},nodes:[
 {...defaultNode('card',0,'wireframe'),x:40,y:220,w:190,h:130,text:'Public user\nBrowser',fill:'#e3eeff'},
 {...defaultNode('card',1,'wireframe'),x:310,y:220,w:220,h:130,text:'API gateway\nRate limit + WAF',fill:'#ffe2bd'},
 {...defaultNode('card',2,'wireframe'),x:615,y:220,w:265,h:130,text:'Database\nRLS + backups',fill:'#e1f5e4'}
 ],logic:[],connections:[],services:['Audit logging','Least privilege','Managed secret storage'],explanation:'Draw a safe flow for services, trust boundaries and security controls.'});
export const starterPoster=():StudioDocument=>({version:2,canvas:{width:700,height:700,background:'#fff3dd'},nodes:[
 {...defaultNode('circle',0,'poster'),x:555,y:25,w:125,h:125,fill:'#F9C585',opacity:.65},
 {...defaultNode('badge',1,'poster'),x:52,y:55,w:310,h:53,text:'STUDY0SG · EVENTS',color:'#9E571A'},
 {...defaultNode('heading',2,'poster'),x:55,y:155,w:575,h:155,text:'COME LEARN WITH US!',fontSize:53},
 {...defaultNode('text',3,'poster'),x:58,y:332,w:540,h:110,text:'Join our next Study0SG community learning event.',fontSize:27},
 {...defaultNode('button',4,'poster'),x:56,y:528,w:435,h:72,text:'Register your interest',fontSize:29},
 {...defaultNode('text',5,'poster'),x:57,y:630,w:585,h:44,text:'study0sg.github.io',fontSize:21}
 ],logic:[],services:[],explanation:'Event publicity draft; approval required before publishing.'});
export function normalizeDocument(raw:unknown,mode:'wireframe'|'poster'):StudioDocument{
 const fallback=mode==='wireframe'?starterWireframe():starterPoster();
 if(!raw||typeof raw!=='object')return fallback;
 const body=raw as Record<string,unknown>;
 if(body.version===2&&body.canvas&&Array.isArray(body.nodes)){
  const c=body.canvas as Record<string,unknown>;
  const safeNode=(n:unknown):CanvasNode|null=>{
   if(!n||typeof n!=='object')return null;
   const r=n as Record<string,unknown>;if(typeof r.kind!=='string'||!Object.hasOwn(PALETTE,r.kind))return null;
   const starter=defaultNode(r.kind as NodeKind,0,mode),num=(k:keyof CanvasNode,fb:number)=>typeof r[k]==='number'&&Number.isFinite(r[k])?r[k] as number:fb;
   return {...starter,id:typeof r.id==='string'&&r.id.length<100?r.id:newId(),x:num('x',0),y:num('y',0),w:clamp(num('w',220),24,1800),h:clamp(num('h',90),24,1800),text:String(r.text??'').slice(0,800),fill:isColor(String(r.fill))?String(r.fill):starter.fill,color:isColor(String(r.color))?String(r.color):starter.color,fontSize:clamp(num('fontSize',22),10,110),opacity:clamp(num('opacity',1),0.1,1),radius:clamp(num('radius',12),0,100),src:typeof r.src==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(r.src)&&r.src.length<700000?r.src:undefined};
  };
  const seen=new Set<string>();
  const width=mode==='poster'?700:960,height=mode==='poster'?700:600;
  const nodes=body.nodes.slice(0,160).map(safeNode).filter((n):n is CanvasNode=>n!==null).map(n=>{
   const id=seen.has(n.id)?newId():n.id;seen.add(id);
   const w=clamp(n.w,24,width),h=clamp(n.h,24,height);
   return {...n,id,w,h,x:clamp(n.x,0,width-w),y:clamp(n.y,0,height-h)};
  });
  return {version:2,canvas:{width,height,background:isColor(String(c.background))?String(c.background):fallback.canvas.background},nodes,connections:Array.isArray(body.connections)?body.connections.slice(0,70).filter((e:unknown)=>e&&typeof e==='object'&&typeof (e as {from?:unknown}).from==='string'&&typeof (e as {to?:unknown}).to==='string').map((e:{from:string;to:string;label?:string})=>({from:e.from.slice(0,100),to:e.to.slice(0,100),label:String(e.label??'').slice(0,80)})).filter((e:{from:string;to:string})=>nodes.some(n=>n.id===e.from)&&nodes.some(n=>n.id===e.to)):[],logic:Array.isArray(body.logic)?body.logic.slice(0,80).filter((r:unknown)=>r&&typeof r==='object'&&typeof (r as LogicRule).id==='string') as LogicRule[]:[],services:Array.isArray(body.services)?body.services.filter((s:unknown):s is string=>typeof s==='string').slice(0,20):[],explanation:String(body.explanation??'').slice(0,500)};
 }
 // Upgrade v1.4.1 saved wireframes automatically (list -> visual canvas).
 if(mode==='wireframe'&&Array.isArray(body.blocks)){
  const nodes=body.blocks.slice(0,50).map((b:Record<string,unknown>,i:number)=>{
   const types:Record<string,NodeKind>={header:'heading',paragraph:'text',button:'button',input:'input',card:'card',table:'table',search:'input',footer:'text'};
   const n=defaultNode(types[String(b.type)]??'text',i,'wireframe');return {...n,x:40+(i%2)*450,y:40+Math.floor(i/2)*130,text:String(b.label??n.text).slice(0,800)};
  });return {...fallback,nodes,services:Array.isArray(body.services)?body.services as string[]:[],explanation:String(body.explanation??'')};
 }
 // Upgrade v1.4.1 EDM drafts automatically.
 if(mode==='poster'&&typeof body.headline==='string'){
  const d=starterPoster(), nodes=[...d.nodes];nodes[2]={...nodes[2],text:body.headline.slice(0,160),x:Number(body.hx)||55,y:(Number(body.hy)||160)-80};nodes[3]={...nodes[3],text:String(body.description??'').slice(0,800)};nodes[4]={...nodes[4],text:String(body.cta??'').slice(0,150)};
  const bg=String(body.background??'');if(isColor(bg))d.canvas.background=bg;
  return {...d,nodes};
 }
 return fallback;
}
