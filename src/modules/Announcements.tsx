import { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '../supabase-portal';
import { mutation, readableDate } from '../portal-data';

type Audience = 'executive'|'support'|'community'|'media'|'technology'|'education';
type Importance = 'normal'|'important'|'urgent';
export type Announcement = {
  id:string;title:string;body:string;department:Audience|null;
  importance:Importance;pinned:boolean;published_at:string;
  expires_at:string|null;author_name:string;read_at:string|null;
};
const departments:Audience[]=['executive','support','community','media','technology','education'];
const audienceName=(name:Audience|null)=>name===null?'Everyone':name[0].toUpperCase()+name.slice(1);
const niceError=(error:unknown)=>error instanceof Error?error.message:'Unable to load announcements';

/** A single source of inbox state for header badges, homepage, and full inbox.
 * The backend decides visibility; no client-side department filter is trusted.
 */
export function useAnnouncements(enabled:boolean){
 const [items,setItems]=useState<Announcement[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState<string|null>(null);
 const refresh=useCallback(async()=>{
  if(!enabled)return;
  const {data,error:queryError}=await db.rpc('v17_announcements_inbox');
  if(queryError)throw new Error(queryError.message);
  setItems((data??[]) as Announcement[]);
  setError(null);
 },[enabled]);
 useEffect(()=>{
  if(!enabled){setItems([]);setLoading(false);return;}
  let live=true;
  const update=async()=>{
   try{await refresh();}catch(e){if(live)setError(niceError(e));}
   finally{if(live)setLoading(false);}
  };
  void update();
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void update();},45_000);
  const onFocus=()=>{if(document.visibilityState==='visible')void update();};
  document.addEventListener('visibilitychange',onFocus);
  window.addEventListener('focus',onFocus);
  // Realtime speeds up delivery while connected; polling is the fallback.
  const channel=db.channel('organizer-announcements')
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'v17_announcements'},()=>{void update();})
   .subscribe();
  return()=>{live=false;window.clearInterval(timer);document.removeEventListener('visibilitychange',onFocus);window.removeEventListener('focus',onFocus);void db.removeChannel(channel);};
 },[enabled,refresh]);
 const markRead=useCallback(async(id:string)=>{
  await mutation('v17_announcement_mark_read',{p_announcement:id});
  setItems(previous=>previous.map(item=>item.id===id?{...item,read_at:new Date().toISOString()}:item));
 },[]);
 const unread=useMemo(()=>items.filter(item=>!item.read_at).length,[items]);
 return {items,loading,error,unread,refresh,markRead};
}
export type AnnouncementInbox = ReturnType<typeof useAnnouncements>;

export function AnnouncementPreview({inbox,open}:{inbox:AnnouncementInbox;open:()=>void}){
 const featured=inbox.items.filter(item=>!item.read_at||item.pinned).slice(0,3);
 return <section className="announcement-preview" aria-labelledby="recent-announcements-title">
  <div className="announcement-heading"><div><span className="eyebrow">DON'T MISS AN UPDATE</span><h2 id="recent-announcements-title">Announcements</h2></div><button type="button" className="secondary-button" onClick={open}>View inbox{inbox.unread>0?` (${inbox.unread} new)`:''}</button></div>
  {inbox.error?<p role="status" className="hint">Announcements couldn't load. Open the inbox to retry.</p>:inbox.loading?<p role="status">Checking announcements…</p>:featured.length===0?<p className="announcement-quiet">You're caught up. New announcements will appear here.</p>:<div className="announcement-preview-list">{featured.map(a=><button type="button" onClick={open} className={`announcement-teaser ${a.importance}`} key={a.id}><span>{a.importance==='urgent'?'⚠ ':''}{a.title}</span><small>{!a.read_at?'● New':'Pinned'} · {audienceName(a.department)}</small></button>)}</div>}
 </section>;
}

export function Announcements({inbox,canGlobal,managerDepartments}:{inbox:AnnouncementInbox;canGlobal:boolean;managerDepartments:Audience[]}){
 const [showEditor,setShowEditor]=useState(false);
 const [title,setTitle]=useState('');const [body,setBody]=useState('');
 const [audience,setAudience]=useState<Audience|'all'>(canGlobal?'all':managerDepartments[0]??'all');
 const [importance,setImportance]=useState<Importance>('normal');
 const [pinned,setPinned]=useState(false);
 const [pending,setPending]=useState(false);
 const [actionError,setActionError]=useState<string|null>(null);
 const [message,setMessage]=useState('');
 const canPost=canGlobal||managerDepartments.length>0;
 const publish=async(event:React.FormEvent<HTMLFormElement>)=>{
  event.preventDefault();setPending(true);setActionError(null);setMessage('');
  try{
   if(audience==='all'&&!canGlobal)throw new Error('Only the Fore Director can publish to everyone.');
   await mutation('v17_announcement_publish',{p_title:title,p_body:body,p_department:audience==='all'?null:audience,p_importance:importance,p_pinned:pinned});
   setTitle('');setBody('');setPinned(false);setImportance('normal');setShowEditor(false);
   await inbox.refresh();setMessage('Announcement published to its approved audience.');
  }catch(e){setActionError(niceError(e));}finally{setPending(false);}
 };
 const mark=async(id:string)=>{
  setPending(true);setActionError(null);
  try{await inbox.markRead(id);}catch(e){setActionError(niceError(e));}finally{setPending(false);}
 };
 return <section className="module-section announcement-inbox">
  <p className="section-lead">Important organizer updates live here. Unlike group chat, notices stay in your inbox until you've marked them as read.</p>
  <div className="announcement-heading"><div className="announcement-count"><strong>{inbox.unread}</strong><span>unread</span></div><div className="announcement-toolbar"><button type="button" className="secondary-button" onClick={()=>void inbox.refresh()}>Refresh</button>{canPost&&<button type="button" className="secondary-button" onClick={()=>setShowEditor(v=>!v)}>{showEditor?'Close editor':'+ New announcement'}</button>}</div></div>
  {inbox.error&&<p role="alert" className="error-alert">{inbox.error}. Check that the v1.7 SQL migration is installed.</p>}
  {actionError&&<p role="alert" className="error-alert">{actionError}</p>}
  {message&&<p role="status" className="success-alert">{message}</p>}
  {showEditor&&canPost&&<form onSubmit={e=>{void publish(e);}} className="announcement-editor editor-box">
    <h2>Publish a message</h2><p className="hint">Only authorized department directors can publish. Write no student personal information.</p>
    <label className="field">Headline<input required maxLength={140} minLength={5} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Example: Volunteer briefing this Saturday"/></label>
    <label className="field">Message<textarea required maxLength={6000} rows={5} value={body} onChange={e=>setBody(e.target.value)} placeholder="What should volunteers know and do?"/></label>
    <div className="form-grid"><label className="field">Who can see this?<select value={audience} onChange={e=>setAudience(e.target.value as Audience|'all')}>{canGlobal&&<option value="all">All organizers</option>}{(canGlobal?departments:managerDepartments).map(d=><option value={d} key={d}>{audienceName(d)} team</option>)}</select></label>
    <label className="field">Priority<select value={importance} onChange={e=>setImportance(e.target.value as Importance)}><option value="normal">Regular</option><option value="important">Important</option><option value="urgent">Urgent</option></select></label></div>
    <label className="check-label"><input type="checkbox" checked={pinned} onChange={e=>setPinned(e.target.checked)}/> Keep at the top of the inbox</label>
    <div className="form-actions"><button type="submit" disabled={pending||title.trim().length<5||!body.trim()}>{pending?'Publishing…':'Publish announcement'}</button></div>
  </form>}
  {inbox.loading?<p role="status">Loading organizer announcements…</p>:inbox.items.length===0?<div className="empty-state">No announcements yet. Check back for team updates.</div>:<div className="announcement-list">{inbox.items.map(a=><article key={a.id} className={`announcement-card ${a.read_at?'is-read':'is-unread'} ${a.importance}`}>
    <div className="announcement-card-top"><div className="announcement-badges">{!a.read_at&&<span className="announcement-new">Unread</span>}{a.pinned&&<span className="status-tag">📌 Pinned</span>}{a.importance!=='normal'&&<span className={`announcement-priority ${a.importance}`}>{a.importance}</span>}</div><span className="announcement-date">{readableDate(a.published_at)}</span></div>
    <h2>{a.title}</h2><p className="announcement-body">{a.body}</p>
    <div className="announcement-footer"><span>{audienceName(a.department)} · Posted by {a.author_name}</span>{!a.read_at?<button type="button" disabled={pending} className="secondary-button" onClick={()=>void mark(a.id)}>Mark as read ✓</button>:<span className="read-receipt">✓ Read {readableDate(a.read_at)}</span>}</div>
  </article>)}</div>}
  <p className="muted-note">Announcements refresh automatically while the portal is open. Background phone push alerts and email delivery are not enabled yet—open the portal to see new notices.</p>
 </section>;
}
