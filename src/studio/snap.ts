/** Load the 400-byte WASM positioning helper only inside the editor, with JS fallback. */
export type Snapper=(value:number,step:number)=>number;
const fallback:Snapper=(value,step)=>step>1?Math.round(value/step)*step:value;
let loaded:Promise<Snapper>|undefined;
export function getSnapper():Promise<Snapper>{
 if(!loaded)loaded=(async()=>{
  try{
   if(typeof WebAssembly==='undefined')return fallback;
   // Vite's BASE_URL supports project subpaths on GitHub Pages.
   const path=`${import.meta.env.BASE_URL}wasm/snap.wasm`;
   const result=await fetch(path,{credentials:'same-origin'});
   if(!result.ok)throw new Error('WASM helper not available');
   const bytes=await result.arrayBuffer();
   const {instance}=await WebAssembly.instantiate(bytes,{});
   const snap=instance.exports.snap;
   if(typeof snap!=='function')return fallback;
   return (value:number,step:number)=>snap(Math.round(value),Math.round(step)) as number;
  }catch{return fallback;}
 })();
 return loaded;
}
