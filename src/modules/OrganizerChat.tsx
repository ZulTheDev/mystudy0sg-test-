import {useEffect,useState} from 'react';
import {db} from '../supabase-portal';
import {mutation} from '../portal-data';
import {useNotice,Notices,Empty} from './common';
type Colleague={id:string;display_name:string};
type Message={id:string;organizer_id:string;body:string;sent_at:string};
export function OrganizerChat({actorId}:{actorId:string}){
 const[names,setNames]=useState<Colleague[]>([]);const[threadId,setThreadId]=useState('');const[mode,setMode]=useState('global');
 const[messages,setMessages]=useState<Message[]>([]);const[text,setText]=useState('');const state=useNotice();
 useEffect(()=>{void (async()=>{try{const {data,error}=await db.rpc('v14_chat_directory');if(error)throw error;setNames((data??[]) as Colleague[]);
 const id=await mutation<string>('v14_chat_open_global',{});setThreadId(id);}catch(e){state.setError(e instanceof Error?e.message:'Could not open chat');}})();},[]);
 useEffect(()=>{if(!threadId)return;let live=true;const poll=async()=>{const {data,error}=await db.from('organizer_chat_messages').select('id,organizer_id,body,sent_at').eq('thread_id',threadId).is('removed_at',null).order('sent_at',{ascending:true}).limit(150);if(live){if(error)state.setError(error.message);else setMessages((data??[]) as Message[]);}};
  void poll();const timer=window.setInterval(()=>void poll(),6000);return()=>{live=false;window.clearInterval(timer);};},[threadId]);
 const global=()=>void state.run(async()=>{const id=await mutation<string>('v14_chat_open_global',{});setThreadId(id);setMode('global');},'All Organizers opened');
 const direct=(id:string)=>void state.run(async()=>{const thread=await mutation<string>('v14_chat_open_direct',{p_partner:id});setThreadId(thread);setMode(id);setMessages([]);},'Direct chat opened');
 const send=()=>void state.run(async()=>{if(!threadId)throw new Error('Chat not available');await mutation('v14_chat_send',{p_thread:threadId,p_body:text});setText('');const {data,error}=await db.from('organizer_chat_messages').select('id,organizer_id,body,sent_at').eq('thread_id',threadId).order('sent_at').limit(150);if(error)throw error;setMessages((data??[]) as Message[]);},'Message sent');
 const display=(id:string)=>names.find(x=>x.id===id)?.display_name??'Organizer';
 return <section className="module-section">
 <p className="section-lead">One organization-wide channel and private one-to-one conversations. Only chat members can read messages. Messages refresh every six seconds.</p>
 <Notices error={state.error} success={state.notice}/><div className="v14-chat">
  <aside className="v14-chat-people"><strong>Conversations</strong><button type="button" className={mode==='global'?'v14-selected':''} onClick={global}>🌏 All Organizers</button><h3>Message an organizer</h3>
  {names.filter(n=>n.id!==actorId).map(n=><button type="button" key={n.id} className={mode===n.id?'v14-selected':''} onClick={()=>direct(n.id)}>{n.display_name}</button>)}</aside>
  <div className="v14-chat-main"><h3>{mode==='global'?'All Organizers':display(mode)}</h3>
   <div className="v14-chat-feed" aria-live="polite">{!messages.length?<Empty>No messages yet. Be the first to say hello.</Empty>:messages.map(m=><div key={m.id} className={m.organizer_id===actorId?'v14-message own':'v14-message'}><strong>{display(m.organizer_id)}</strong><p>{m.body}</p><small>{new Date(m.sent_at).toLocaleString('en-SG')}</small></div>)}</div>
   <form className="v14-chat-compose" onSubmit={e=>{e.preventDefault();send();}}><input aria-label="Message" placeholder="Send an update..." maxLength={2000} value={text} onChange={e=>setText(e.target.value)}/><button disabled={!threadId||!text.trim()||state.busy}>Send</button></form>
  </div>
 </div><p className="muted-note">No file attachments, moderation escalation or push notifications yet. Avoid posting student personal data.</p>
 </section>;
}
