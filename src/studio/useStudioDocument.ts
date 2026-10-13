import {useCallback,useRef,useState} from 'react';
import type {StudioDocument} from './model';
export function useStudioDocument(initial:()=>StudioDocument){
 const [doc,setDoc]=useState<StudioDocument>(initial);
 const ref=useRef(doc),past=useRef<StudioDocument[]>([]),future=useRef<StudioDocument[]>([]);
 const edit=useCallback((fn:(d:StudioDocument)=>StudioDocument,remember=true)=>{
  const before=ref.current,next=fn(before);if(next===before)return;
  if(remember){past.current=[...past.current.slice(-29),before];future.current=[];}
  ref.current=next;setDoc(next);
 },[]);
 const record=useCallback((before:StudioDocument)=>{
  if(before!==ref.current){past.current=[...past.current.slice(-29),before];future.current=[];}
 },[]);
 const reset=useCallback((next:StudioDocument)=>{past.current=[];future.current=[];ref.current=next;setDoc(next);},[]);
 const undo=useCallback(()=>{const prev=past.current.pop();if(!prev)return;future.current.push(ref.current);ref.current=prev;setDoc(prev);},[]);
 const redo=useCallback(()=>{const next=future.current.pop();if(!next)return;past.current.push(ref.current);ref.current=next;setDoc(next);},[]);
 return {doc,edit,record,reset,undo,redo};
}
