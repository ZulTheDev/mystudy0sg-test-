import {useCallback,useEffect,useMemo,useState} from 'react';
import {db,getPortalToken} from '../supabase-portal';
import {Empty,Notices} from './common';

type MonitorState='healthy'|'degraded'|'down'|'unconfigured';
type Service={id:string;display_name:string;category:string;summary:string;expected_interval_seconds:number};
type Check={id:number;service_id:string;state:MonitorState;response_ms:number|null;http_status:number|null;note:string;checked_at:string};
type Incident={id:string;service_id:string;severity:'notice'|'attention';headline:string;opened_at:string;last_detected_at:string;acknowledged_at:string|null;resolved_at:string|null};
type BrowserTrace={id:string;host:string;initiator:string;duration:number;size:number|null};
const statusNames:Record<MonitorState|'stale',string>={healthy:'Healthy',degraded:'Degraded',down:'Down',unconfigured:'Not configured',stale:'Stale'};

function timeLabel(value:string) {return new Date(value).toLocaleString();}

// Resource Timing shows local browser network timings, NOT raw packets or HTTP codes.
function getBrowserTraces():BrowserTrace[]{
 const allowed=new Set([location.hostname,new URL(import.meta.env.VITE_SUPABASE_URL).hostname]);
 const entries=performance.getEntriesByType('resource') as PerformanceResourceTiming[];
 const list:BrowserTrace[]=[];
 // Keep the original resource index so equal timestamps still get unique row keys.
 for(let i=Math.max(0,entries.length-130);i<entries.length;i++){
  const entry=entries[i];
  try{
   const uri=new URL(entry.name);
   if(!allowed.has(uri.hostname))continue;
   const host=uri.hostname;
   // Never include paths, query strings, tokens, headers or packet content.
   list.push({id:`resource-${i}-${entry.startTime}`,host,initiator:entry.initiatorType||'resource',duration:Math.round(entry.duration),size:entry.transferSize>0?entry.transferSize:null});
  }catch{/* Ignore malformed resource entries. */}
 }
 return list.slice(-15).reverse();
}

export function SecurityObservatory(){
 const [services,setServices]=useState<Service[]>([]);
 const [checks,setChecks]=useState<Check[]>([]);
 const [incidents,setIncidents]=useState<Incident[]>([]);
 const [traces,setTraces]=useState<BrowserTrace[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [now,setNow]=useState(Date.now());
 const [watchBrowser,setWatchBrowser]=useState(false);

 const refresh=useCallback(async()=>{
  const [a,b,c]=await Promise.all([
   db.from('monitor_services').select('id,display_name,category,summary,expected_interval_seconds').order('display_name'),
   db.from('monitor_checks').select('id,service_id,state,response_ms,http_status,note,checked_at').order('checked_at',{ascending:false}).limit(240),
   db.from('monitor_incidents').select('id,service_id,severity,headline,opened_at,last_detected_at,acknowledged_at,resolved_at').order('opened_at',{ascending:false}).limit(30),
  ]);
  const issue=a.error||b.error||c.error;
  if(issue) throw new Error(issue.message);
  setServices((a.data||[]) as Service[]);
  setChecks((b.data||[]) as Check[]);
  setIncidents((c.data||[]) as Incident[]);
  setNow(Date.now());
 },[]);

 useEffect(()=>{
  let mounted=true;
  const load=async()=>{try{await refresh();if(mounted)setError('');}catch(e){if(mounted)setError(e instanceof Error?e.message:'Monitoring request failed');}finally{if(mounted)setLoading(false);}};
  void load();
  const poll=window.setInterval(()=>{void load();},20000);
  const channel=db.channel('study0sg-monitor-health')
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'monitor_checks'},()=>{void load();})
   .on('postgres_changes',{event:'*',schema:'public',table:'monitor_incidents'},()=>{void load();})
   .subscribe();
  return()=>{mounted=false;window.clearInterval(poll);void db.removeChannel(channel);};
 },[refresh]);

 useEffect(()=>{
  if(!watchBrowser){setTraces([]);return;}
  const read=()=>setTraces(getBrowserTraces());
  read();const timer=window.setInterval(read,4000);
  return()=>window.clearInterval(timer);
 },[watchBrowser]);

 const byService=useMemo(()=>{
  const result:Record<string,Check[]>={};
  for(const check of checks){(result[check.service_id]??=[]).push(check);}
  return result;
 },[checks]);

 const runNow=async()=>{
  const token=getPortalToken();
  if(!token){setError('Session expired: please sign in again');return;}
  setBusy(true);setError('');setNotice('');
  try{
   const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/monitor-run`,{
    method:'POST',headers:{'content-type':'application/json',apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`},body:'{}',
   });
   const body=await response.json() as {error?:string;skipped?:boolean};
   if(!response.ok)throw new Error(body.error||`Probe failed (HTTP ${response.status})`);
   setNotice(body.skipped?'A recent check already ran; showing the latest results.':'Checks submitted successfully.');
   await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Could not run checks');}
  finally{setBusy(false);}
 };

 const acknowledge=async(id:string)=>{
  setBusy(true);setError('');setNotice('');
  try{
   const {error:ackError}=await db.rpc('monitor_acknowledge',{p_incident_id:id});
   if(ackError)throw ackError;
   setNotice('Incident acknowledged. The history is preserved.');await refresh();
  }catch(e){setError(e instanceof Error?e.message:'Acknowledgement failed');}
  finally{setBusy(false);}
 };

 const latest=services.map(service=>{
  const check=byService[service.id]?.[0];
  const stale=!check || Date.now()-new Date(check.checked_at).getTime()>Math.max(180000,service.expected_interval_seconds*3*1000);
  const state:MonitorState|'stale'=stale?'stale':check!.state;
  return {service,check,state};
 });
 const operational=latest.filter(x=>x.state==='healthy').length;
 const down=latest.filter(x=>x.state==='down').length;
 const unknown=latest.filter(x=>x.state==='unconfigured'||x.state==='stale').length;
 const open=incidents.filter(i=>!i.resolved_at);

 return <section className="module-section monitor-root" aria-label="Study0SG service observatory">
  <p className="section-lead">Continuous, permission-scoped service availability checks, recent incidents and optional browser request timing. Scheduled probes run independently of this tab; the display refreshes every 20 seconds.</p>
  <div className="record-actions">
   <button type="button" disabled={busy} onClick={()=>{void runNow();}}>{busy?'Checking…':'Run checks now'}</button>
   <button type="button" className="secondary-button" onClick={()=>{void refresh().catch(e=>setError(String(e)));}}>Refresh results</button>
  </div>
  <Notices loading={loading} error={error} success={notice}/>
  <div className="metric-row" aria-live="polite">
   <div className="metric"><span>Healthy services</span><strong>{operational}/{latest.length || '—'}</strong></div>
   <div className="metric"><span>Down services</span><strong>{down}</strong></div>
   <div className="metric"><span>Unknown / unconfigured</span><strong>{unknown}</strong></div>
  </div>
  <p className="hint">Last screen refresh: {new Date(now).toLocaleTimeString()}. Checks run from Supabase, not your browser. Missing or old results are never shown as healthy.</p>

  <h2>Service health</h2>
  {!services.length&&!loading?<Empty>No monitoring records yet. Apply the v1.3 SQL migration, deploy monitor-run and execute one authorized probe.</Empty>:
   <div className="monitor-service-grid">{latest.map(({service,check,state})=><article key={service.id} className="record-card">
     <div className="record-top"><strong>{service.display_name}</strong><span className={`monitor-chip ${state}`}>{statusNames[state]}</span></div>
     <p>{service.summary}</p>
     <div className="record-meta"><span>Response: {check?.response_ms!=null?`${check.response_ms} ms`:'—'}</span><span>HTTP: {check?.http_status??'—'}</span></div>
     <p className="hint">{check?.note??'No checks received yet'}</p>
     <p className="hint">{check?`Checked ${timeLabel(check.checked_at)}`:'No checks yet'}</p>
     <div className="monitor-bars" aria-label="Recent outcomes, oldest to newest">{(byService[service.id]||[]).slice(0,24).reverse().map(sample=><span key={sample.id} className={`monitor-bar ${sample.state}`} title={`${timeLabel(sample.checked_at)}: ${sample.state}`}/>)}</div>
   </article>)}</div>}

  <h2>Service incidents</h2>
  {!incidents.length?<Empty>No incidents have been recorded yet. Two consecutive unsuccessful probes are required to open an incident.</Empty>:
   <div className="record-list">{incidents.slice(0,20).map(i=><article key={i.id} className="record-card">
     <div className="record-top"><strong>{services.find(s=>s.id===i.service_id)?.display_name??i.service_id}: {i.headline}</strong>
      <span className={`monitor-chip ${i.resolved_at?'healthy':i.severity==='attention'?'down':'degraded'}`}>{i.resolved_at?'Resolved':i.acknowledged_at?'Acknowledged':'Open'}</span></div>
     <p className="hint">Started: {timeLabel(i.opened_at)} · {i.resolved_at?`Recovered: ${timeLabel(i.resolved_at)}`:`Last detected: ${timeLabel(i.last_detected_at)}`}</p>
     {!i.resolved_at&&!i.acknowledged_at&&<button type="button" disabled={busy} onClick={()=>{void acknowledge(i.id);}}>Acknowledge incident</button>}
   </article>)}</div>}

  <h2>Network request timing (this browser)</h2>
  <p className="hint">This shows resource timings visible to your current browser session only—not TCP packets, other users' traffic, request bodies, security tokens or HTTP status codes. Cross-origin timings can be restricted.</p>
  <label className="check-label"><input type="checkbox" checked={watchBrowser} onChange={e=>setWatchBrowser(e.target.checked)}/> Show temporary browser timing diagnostics</label>
  {watchBrowser&&(!traces.length?<Empty>No matching browser resource timings yet. Load another portal page, then return here.</Empty>:
   <div className="monitor-traces"><table><thead><tr><th>Host</th><th>Request type</th><th>Duration</th><th>Transfer estimate</th></tr></thead><tbody>
    {traces.map(t=><tr key={t.id}><td>{t.host}</td><td>{t.initiator}</td><td>{t.duration} ms</td><td>{t.size==null?'Unavailable':`${t.size} B`}</td></tr>)}
   </tbody></table></div>)}
  <p className="hint">For raw packet captures, deploy a separately approved collector on infrastructure Study0SG owns. This static web app cannot inspect network packets from Stytch, Supabase, Google, Cloudflare or other visitors.</p>
 </section>;
}
