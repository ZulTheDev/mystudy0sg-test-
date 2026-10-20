import {useEffect,useRef,useState} from 'react';
import * as Y from 'yjs';
import {db,getPortalToken} from '../supabase-portal';
import type {StudioDocument} from './model';

// Live changes merge by node ID. Shared revisions still need an explicit Save.
function encode(bytes:Uint8Array){let binary='';for(const n of bytes)binary+=String.fromCharCode(n);return btoa(binary);}
function decode(text:string){const binary=atob(text);return Uint8Array.from(binary,c=>c.charCodeAt(0));}

export function useLiveStudio(id:string|null,doc:StudioDocument,reset:(d:StudioDocument)=>void){
 const [status,setStatus]=useState<'offline'|'connecting'|'live'>('offline');
 const remoteHash=useRef(''),model=useRef<{ydoc:Y.Doc;nodes:Y.Map<StudioDocument['nodes'][number]>;meta:Y.Map<unknown>}|null>(null);
 const docRef=useRef(doc),resetRef=useRef(reset);
 docRef.current=doc;resetRef.current=reset;
 useEffect(()=>{
  if(!id||!getPortalToken()){setStatus('offline');model.current=null;return;}
  const ydoc=new Y.Doc();
  const nodes=ydoc.getMap<StudioDocument['nodes'][number]>('nodes');
  const meta=ydoc.getMap<unknown>('meta');
  model.current={ydoc,nodes,meta};
  // Seed the local CRDT from the last loaded revision.
  ydoc.transact(()=>{
   for(const node of docRef.current.nodes)nodes.set(node.id,node);
   for(const key of ['canvas','logic','services','connections','explanation','version'] as const)meta.set(key,docRef.current[key]);
   meta.set('order',docRef.current.nodes.map(n=>n.id));
  },'seed');
  const channel=db.channel('studio-yjs:'+id,{config:{private:true,broadcast:{self:false}}});
  const apply=(payload:{update?:string})=>{
   if(typeof payload.update!=='string'||payload.update.length>100000)return;
   try{Y.applyUpdate(ydoc,decode(payload.update),'remote');}catch{/* Ignore a corrupt update */ }
  };
  channel.on('broadcast',{event:'sync'},({payload})=>apply(payload as {update?:string}))
   .on('broadcast',{event:'request'},()=>{
     const update=encode(Y.encodeStateAsUpdate(ydoc));
     if(update.length<100000)void channel.send({type:'broadcast',event:'sync',payload:{update}});
   });
  const updateHandler=(update:Uint8Array,origin:unknown)=>{
   if(origin==='remote'){
    const current=docRef.current;
    const changed:StudioDocument={...current,
     canvas:meta.get('canvas') as StudioDocument['canvas']||current.canvas,
     logic:meta.get('logic') as StudioDocument['logic']||current.logic,
     services:meta.get('services') as string[]||current.services,
     connections:meta.get('connections') as StudioDocument['connections']||current.connections,
     explanation:meta.get('explanation') as string||current.explanation,
     nodes:[...nodes.values()].sort((a,b)=>{
       const order=(meta.get('order') as string[]||[]);
       return order.indexOf(a.id)-order.indexOf(b.id);
     })
    };
    remoteHash.current=JSON.stringify(changed);
    resetRef.current(changed);
   }else if(origin!=='seed'&&status!=='offline'){
    const packet=encode(update);
    if(packet.length<100000)void channel.send({type:'broadcast',event:'sync',payload:{update:packet}});
   }
  };
  ydoc.on('update',updateHandler);
  setStatus('connecting');
  void db.realtime.setAuth(getPortalToken()||'');
  channel.subscribe(s=>{
   if(s==='SUBSCRIBED'){setStatus('live');void channel.send({type:'broadcast',event:'request',payload:{}});}
   else if(s==='CHANNEL_ERROR'||s==='TIMED_OUT'||s==='CLOSED')setStatus('offline');
  });
  return()=>{model.current=null;ydoc.off('update',updateHandler);void db.removeChannel(channel);ydoc.destroy();setStatus('offline');};
 // The room changes only when a saved design is opened.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[id]);
 useEffect(()=>{
  const current=model.current;if(!current)return;
  const serialized=JSON.stringify(doc);
  if(serialized===remoteHash.current){remoteHash.current='';return;}
  current.ydoc.transact(()=>{
   const wanted=new Set(doc.nodes.map(n=>n.id));
   for(const key of [...current.nodes.keys()])if(!wanted.has(key))current.nodes.delete(key);
   for(const node of doc.nodes){
    if(JSON.stringify(current.nodes.get(node.id))!==JSON.stringify(node))current.nodes.set(node.id,node);
   }
   const entries:{[key:string]:unknown}={canvas:doc.canvas,logic:doc.logic,services:doc.services,connections:doc.connections||[],explanation:doc.explanation,version:doc.version,order:doc.nodes.map(n=>n.id)};
   for(const [key,value] of Object.entries(entries)){
    if(JSON.stringify(current.meta.get(key))!==JSON.stringify(value))current.meta.set(key,value);
   }
  },'local');
 },[doc]);
 return status;
}
