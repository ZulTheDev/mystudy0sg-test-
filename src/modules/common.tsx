import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { rows, type Department } from '../portal-data';

// A small reloadable data hook; every view reports real server errors.
export function useRecords<T>(table:string, fields='*') {
  const [data,setData]=useState<T[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const refresh=useCallback(async()=>{
    setLoading(true);setError('');
    try {setData(await rows<T>(table,fields));}
    catch(e){setError(e instanceof Error?e.message:'Could not fetch records');}
    finally{setLoading(false);}
  },[table,fields]);
  useEffect(()=>{void refresh();},[refresh]);
  return {data,loading,error,refresh};
}

export function useNotice(){
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const run=async(fn:()=>Promise<unknown>, success='Saved successfully')=>{
    setBusy(true);setNotice('');setError('');
    try{await fn();setNotice(success);return true;}
    catch(e){setError(e instanceof Error?e.message:'Request failed');return false;}
    finally{setBusy(false);}
  };
  return {busy,notice,error,run,setError};
}

export function Notices({loading,error,success}:{loading?:boolean;error?:string;success?:string}){
  return <>{loading&&<p role="status" className="hint">Loading live records…</p>}{error&&<p role="alert" className="error-alert">{error}</p>}{success&&<p role="status" className="success-alert">{success}</p>}</>;
}
export function Empty({children='No records yet.'}:{children?:ReactNode}){return <p className="empty-state">{children}</p>}
export function Field({label,children}:{label:string;children:ReactNode}){
  return <label className="field"><span>{label}</span>{children}</label>
}
export const deptLabels:Record<Department,string>={executive:'Executive',support:'Support Pool',community:'Community Crew',media:'Media Crew',technology:'Tech & Security',education:'Educator Circle'};
export function Status({value}:{value:string}){return <span className={`status-tag status-${value}`}>{value.replaceAll('_',' ')}</span>}
