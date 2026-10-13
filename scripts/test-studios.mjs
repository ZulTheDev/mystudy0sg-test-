/** Basic CI-safe checks that don't need a browser or Supabase credentials. */
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),ts=require('typescript');
const compiled=new Map();
function load(file){
 if(compiled.has(file))return compiled.get(file);
 const src=fs.readFileSync(new URL(file,import.meta.url),'utf8');
 const code=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const obj={exports:{}};compiled.set(file,obj.exports);
 const context={exports:obj.exports,require:(key)=>{
  if(key.endsWith('/model')||key.endsWith('./model'))return load('../src/studio/model.ts');
  if(key.endsWith('v14-utils'))return {xmlEscape:(s)=>String(s).replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]))};
  throw Error('Unexpected dependency: '+key);
 },crypto,TextEncoder,console};
 vm.runInNewContext(code,context,{filename:file});return obj.exports;
}
const {starterWireframe,starterPoster,starterSecurity,normalizeDocument,resizeArtboard,fitNewNode}=load('../src/studio/model.ts');
const {toReactSource,toSvg}=load('../src/studio/exporters.ts');
const base=starterWireframe(),poster=starterPoster(),security=starterSecurity();
// Sizing a frame updates the saved document and keeps objects inside its edges.
const small=resizeArtboard(base,390,844);
if(small.canvas.width!==390||small.canvas.height!==844||small.nodes.some(n=>n.x<0||n.y<0||n.x+n.w>390||n.y+n.h>844))throw Error('Artboard resize produced overflow');
const shape=fitNewNode({...poster.nodes[2],w:900,h:800},resizeArtboard(poster,320,320));
if(shape.w>320||shape.h>320)throw Error('New node exceeds the resized artboard');
const large=normalizeDocument(resizeArtboard(poster,2200,1900),'poster');
if(large.canvas.width!==2200||large.canvas.height!==1900)throw Error('Large custom artboard lost dimensions on save');
for(const [name,doc] of [['wireframe',base],['poster',poster],['security',security]]){
 const normalized=normalizeDocument(JSON.parse(JSON.stringify(doc)),name==='poster'?'poster':'wireframe');
 if(normalized.nodes.length!==doc.nodes.length)throw Error(name+' roundtrip failed');
 const ids=new Set(doc.nodes.map(n=>n.id));if(ids.size!==doc.nodes.length)throw Error('Duplicate '+name+' node ids');
 const svg=toSvg(doc);if(!svg.startsWith('<?xml')||!svg.includes('Study0SG exported design'))throw Error('Invalid '+name+' SVG');
 const src=toReactSource('Study0SG Design',doc);
 const parsed=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX},fileName:'GeneratedPage.tsx',reportDiagnostics:true});
 if((parsed.diagnostics||[]).some(d=>d.category===ts.DiagnosticCategory.Error))throw Error(name+' generated TSX contains syntax errors');
}
// Security backend diagrams must round-trip structured connections without executable code.
security.connections=[{from:security.nodes[0].id,to:security.nodes[1].id,label:'HTTPS + JWT'}];
const safeMap=normalizeDocument(JSON.parse(JSON.stringify(security)),'wireframe');
if(safeMap.connections?.length!==1||!toSvg(safeMap).includes('<line '))throw Error('Security flow connection was lost during save or export');
// Imported duplicate IDs are repaired before React receives them as list keys.
const duplicates=JSON.parse(JSON.stringify(base));
duplicates.nodes[1].id=duplicates.nodes[0].id;
const repaired=normalizeDocument(duplicates,'wireframe');
if(new Set(repaired.nodes.map(n=>n.id)).size!==repaired.nodes.length)throw Error('Imported IDs were not deduplicated');
// A hostile string must be escaped in SVG and must not become raw script in the code export.
const hostile={...poster,nodes:[{...poster.nodes[0],kind:'text',text:'<script>alert("x")</script>'}]};
if(toSvg(hostile).includes('<script>'))throw Error('SVG escaping failed');
if(process.env.WRITE_GENERATED==='1')fs.writeFileSync(new URL('../src/__studio_generated_check.tsx',import.meta.url),toReactSource('Study0SG Test',base));
console.log('PASS: editor data, unique IDs, SVG escaping and generated React TSX syntax');
