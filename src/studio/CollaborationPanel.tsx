import {useCallback,useEffect,useRef,useState} from 'react';
import {db,getPortalToken} from '../supabase-portal';
import {mutation} from '../portal-data';
import type {StudioDocument} from './model';

type StudioKind='edm'|'wireframe'|'security'|'tool';
type Saved={id:string;title:string;body:unknown;kind:string;revision?:number};
type Colleague={id:string;display_name:string};
type SharedMember={organizer_id:string;permission:string};

/** Whole-document optimistic locking: realtime updates show immediately for clean canvases.
 * Dirty local changes are NEVER overwritten by incoming changes. This is not CRDT editing. */
export function useStudioCollaboration(kind:StudioKind,doc:StudioDocument,title:string,reset:(d:StudioDocument)=>void,setTitle:(s:string)=>void,refresh:()=>Promise<void>,normalize:(v:unknown)=>StudioDocument){
 const [id,setId]=useState<string|null>(null),[revision,setRevision]=useState(0),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[incoming,setIncoming]=useState<Saved|null>(null),[live,setLive]=useState(false);
 const lastSaved=useRef<string>(JSON.stringify(doc));
 const isDirty=JSON.stringify(doc)!==lastSaved.current;
 const liveInputs=useRef({doc,normalize,reset,setTitle,revision});
 liveInputs.current={doc,normalize,reset,setTitle,revision};
 const open=useCallback((row:Saved)=>{const safe=normalize(row.body);reset(safe);setTitle(row.title);setId(row.id);setRevision(row.revision??0);lastSaved.current=JSON.stringify(safe);setIncoming(null);setError('');setNotice(`Opened shared revision ${row.revision??0}.`);},[normalize,reset,setTitle]);
 const save=async(documentToSave:StudioDocument=doc)=>{
  setBusy(true);setError('');setNotice('');
  try{
   if(new TextEncoder().encode(JSON.stringify(documentToSave)).length>38_000)throw new Error('Design exceeds 38 KB. Export your JSON backup or remove large assets.');
   const data=await mutation<{id:string;revision:number}>('v16_studio_save',{p_kind:kind,p_title:title,p_body:documentToSave,p_id:id,p_expected_revision:revision});
   setId(data.id);setRevision(data.revision);lastSaved.current=JSON.stringify(doc);setNotice(`Saved revision ${data.revision}. Your teammates can now receive it.`);setIncoming(null);
   await refresh();return true;
  }catch(e){setError(e instanceof Error?e.message:'Save failed');return false;}
  finally{setBusy(false);}
 };
 const newDraft=()=>{setId(null);setRevision(0);setIncoming(null);setError('');lastSaved.current=JSON.stringify(doc);};
 useEffect(()=>{
  if(!id)return;
  let active=true;
  const token=getPortalToken();
  if(!token){setError('Session expired. Sign in again to collaborate.');return;}
  // Realtime needs the same short-lived ES256 portal JWT as PostgREST.
  void db.realtime.setAuth(token);
  const channel=db.channel(`studio-review:${id}`)
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'v14_studio_documents',filter:`id=eq.${id}`},(payload: {new:unknown})=>{
     const row=payload.new as Saved;
     if(!active||typeof row.revision!=='number'||row.revision<=liveInputs.current.revision)return;
     // Compare currently edited canvas with the last successfully saved version.
     // Never replace dirty edits; preserving them prevents data loss.
     if(JSON.stringify(liveInputs.current.doc)!==lastSaved.current){setIncoming(row);setNotice('A teammate published a newer revision. Save a JSON backup before switching.');}
     else{const safe=liveInputs.current.normalize(row.body);liveInputs.current.reset(safe);liveInputs.current.setTitle(row.title);setRevision(row.revision);lastSaved.current=JSON.stringify(safe);setNotice(`Live: loaded teammate's revision ${row.revision}.`);}
   })
   .subscribe((status: string)=>{if(active)setLive(status==='SUBSCRIBED');});
  return()=>{active=false;setLive(false);void db.removeChannel(channel);};
 },[id]);
 const applyIncoming=()=>{if(!incoming)return;open(incoming);};
 return {id,revision,open,save,newDraft,busy,error,notice,live,isDirty,incoming,applyIncoming,setError};
}

export function CollaborationPanel({id,revision,live,isDirty,incoming,applyIncoming,error,notice,busy,save}:{
 id:string|null;revision:number;live:boolean;isDirty:boolean;incoming:Saved|null;applyIncoming:()=>void;error:string;notice:string;busy:boolean;save:()=>void;
}){
 const [people,setPeople]=useState<Colleague[]>([]),[members,setMembers]=useState<SharedMember[]>([]),[person,setPerson]=useState(''),[permission,setPermission]=useState('editor'),[inviting,setInviting]=useState(false),[shareError,setShareError]=useState('');
 useEffect(()=>{void db.rpc('v14_chat_directory').then(({data}: {data:unknown})=>setPeople((data??[]) as Colleague[]));},[]);
 useEffect(()=>{if(!id){setMembers([]);return;}void db.from('v16_studio_members').select('organizer_id,permission').eq('document_id',id).then(({data,error}: {data:unknown;error:{message:string}|null})=>{if(error)setShareError(error.message);else setMembers((data??[]) as SharedMember[]);});},[id,notice]);
 const invite=async()=>{if(!id||!person)return;setInviting(true);setShareError('');try{await mutation('v16_studio_share',{p_document:id,p_organizer:person,p_permission:permission});const {data,error}=await db.from('v16_studio_members').select('organizer_id,permission').eq('document_id',id);if(error)throw error;setMembers((data??[]) as SharedMember[]);}catch(e){setShareError(e instanceof Error?e.message:'Could not share');}finally{setInviting(false);}};
 return <section className="studio-collaboration" aria-label="Live teamwork">
   <h3>Teamwork · Shared canvas</h3>
   <p className="hint">Save a revision for your teammates to see it. Changes made by another person are refreshed live if you have no unsaved edits. If both of you change the same document, you will be asked to resolve the conflict.</p>
   <div className="record-actions"><span className="status-tag">Revision {revision}</span><span className="status-tag">{live?'● Live connected':'○ Connecting / offline'}</span><span className="status-tag">{isDirty?'Unsaved local edits':'Saved version'}</span><button type="button" disabled={busy} onClick={save}>{busy?'Saving…':'Save shared revision'}</button></div>
   {notice&&<p role="status" className="success-alert">{notice}</p>}{error&&<p role="alert" className="error-alert">{error}</p>}
   {incoming&&<div className="error-alert" role="alert">A teammate saved revision {incoming.revision}. Download your editable JSON first if you want to keep your local work. <button type="button" onClick={applyIncoming}>Load teammate's version (discard local edits)</button></div>}
   {id?<div className="studio-share-panel"><strong>Invite a teammate</strong><p className="hint">Only the design owner or Fore Director can change access. Guests can view; editors can save new versions.</p>
     <div className="record-actions"><select aria-label="Organizer to invite" value={person} onChange={e=>setPerson(e.target.value)}><option value="">Choose an organizer</option>{people.map(p=><option key={p.id} value={p.id}>{p.display_name}</option>)}</select><select aria-label="Collaborator permission" value={permission} onChange={e=>setPermission(e.target.value)}><option value="editor">Editor</option><option value="viewer">Viewer</option><option value="remove">Remove access</option></select><button type="button" disabled={!person||inviting} onClick={()=>void invite()}>Update access</button></div>
     {shareError&&<p role="alert" className="error-alert">{shareError}</p>}{members.length>0&&<p className="hint">Shared with: {members.map(m=>`${people.find(p=>p.id===m.organizer_id)?.display_name??'Organizer'} (${m.permission})`).join(', ')}</p>}
   </div>:<p className="hint">Save your design once to create a shared project and enable invitations.</p>}
  </section>;
}
