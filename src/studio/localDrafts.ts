/** Device-only IndexedDB storage. Seven-day TTL; no server upload, no database write.
 * Browsers may evict storage earlier; clear devices/shared computers after editing.
 */
import type {StudioDocument} from './model';
const DB='study0sg-private-studio-cache-v2', STORE='drafts', TTL=7*24*60*60*1000;
type Draft={key:string;updated:number;document:StudioDocument;title:string};
function openDb():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  if(!('indexedDB' in window))return reject(Error('IndexedDB unavailable'));
  const r=indexedDB.open(DB,1);
  r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'key'});};
  r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);
 });
}
async function transact<T>(mode:IDBTransactionMode,action:(store:IDBObjectStore,resolve:(v:T)=>void,reject:(e:unknown)=>void)=>void):Promise<T>{
 const db=await openDb();try{return await new Promise((resolve,reject)=>{
  const transaction=db.transaction(STORE,mode),store=transaction.objectStore(STORE);
  transaction.onerror=()=>reject(transaction.error);
  action(store,resolve,reject);
 });}finally{db.close();}
}
export async function saveLocalDraft(key:string,document:StudioDocument,title:string):Promise<void>{
 const data:Draft={key,updated:Date.now(),document,title};
 await transact<void>('readwrite',(store,resolve,reject)=>{const r=store.put(data);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});
}
export async function readLocalDraft(key:string):Promise<Draft|null>{
 const result=await transact<Draft|undefined>('readonly',(store,resolve,reject)=>{const r=store.get(key);r.onsuccess=()=>resolve(r.result as Draft|undefined);r.onerror=()=>reject(r.error);});
 if(!result)return null;
 if(Date.now()-result.updated>TTL){await clearLocalDraft(key);return null;}
 return result;
}
export async function clearLocalDraft(key:string):Promise<void>{
 await transact<void>('readwrite',(store,resolve,reject)=>{const r=store.delete(key);r.onsuccess=()=>resolve();r.onerror=()=>reject(r.error);});
}
export async function purgeOldLocalDrafts():Promise<number>{
 return transact<number>('readwrite',(store,resolve,reject)=>{
  let purged=0;const cursor=store.openCursor();
  cursor.onerror=()=>reject(cursor.error);
  cursor.onsuccess=()=>{const item=cursor.result;if(!item){resolve(purged);return;}
    if(Date.now()-(item.value as Draft).updated>TTL){item.delete();purged++;}
    item.continue();};
 });
}
