/** Export starter templates ONLY, never live application infrastructure.
 * Only React uses the original functional v1.5 generator. Other targets are layout
 * scaffolds requiring accessibility, tests and developer integration.
 */
import type {StudioDocument} from './model';
import {toReactSource} from './exporters';
export const codeTargets={
 react:'React + TypeScript',astro:'Astro',solid:'SolidJS',typescript:'TypeScript',
 javascript:'Vanilla JavaScript',html:'Vanilla HTML',css:'Vanilla CSS',
 kotlin:'Kotlin / Compose',elixir:'Elixir',golang:'Go',rust:'Rust',ruby:'Ruby',flutter:'Flutter',
} as const;
export type CodeTarget=keyof typeof codeTargets;
const escapeHtml=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const safe=(s:string)=>s.replace(/[\r\n]/g,' ').replaceAll('*/','').slice(0,140);
const ext:Record<CodeTarget,string>={react:'tsx',astro:'astro',solid:'tsx',typescript:'ts',javascript:'js',html:'html',css:'css',kotlin:'kt',elixir:'exs',golang:'go',rust:'rs',ruby:'rb',flutter:'dart'};
export function generateStarter(target:CodeTarget,title:string,doc:StudioDocument):{filename:string;source:string;explanation:string}{
 const nodes=doc.nodes.slice(0,120).map(n=>({kind:n.kind,text:n.text.slice(0,500),x:n.x,y:n.y,w:n.w,h:n.h,fill:n.fill,color:n.color}));
 const comment=`Study0SG prototype scaffold. Purpose: ${safe(doc.explanation)}. API integrations must run on an authenticated backend. No secrets are included. `;
 const htmlBody=nodes.map((n,i)=>`  <div class="node-${i}" aria-label="${escapeHtml(n.kind)}">${escapeHtml(n.text)}</div>`).join('\n');
 const cssBody=nodes.map((n,i)=>`.node-${i}{position:absolute;left:${(n.x/doc.canvas.width*100).toFixed(2)}%;top:${(n.y/doc.canvas.height*100).toFixed(2)}%;width:${(n.w/doc.canvas.width*100).toFixed(2)}%;min-height:${(n.h/doc.canvas.height*100).toFixed(2)}%;background:${n.fill};color:${n.color};padding:6px;box-sizing:border-box;overflow:hidden}`).join('\n');
 let source='',explanation='This is a starting layout, not a complete application. Add accessibility, API authorization and automated tests before release.';
 switch(target){
  case 'react':source=toReactSource(title,doc);explanation='Interactive starter for React and TypeScript. Test all logic blocks and add actual backend actions separately.';break;
  case 'html':source=`<!doctype html>\n<!-- ${comment} -->\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="design.css"></head><body><main class="study0sg-frame">\n${htmlBody}\n</main></body></html>`;break;
  case 'css':source=`/* ${comment} */\n.study0sg-frame{position:relative;margin:auto;width:100%;max-width:${doc.canvas.width}px;min-height:${doc.canvas.height}px;background:${doc.canvas.background}}\n${cssBody}`;break;
  case 'javascript':source=`// ${comment}\n// Appends editable placeholders, never runs user-provided HTML.\nconst pieces=${JSON.stringify(nodes,null,2)};\nconst app=document.querySelector('#app');\nif(!app)throw Error('Missing #app');\nfor(const part of pieces){const el=document.createElement('div');el.textContent=part.text;el.className='study0sg-part';app.append(el);}\n// Add vetted click handlers and a server-side API broker here.`;break;
  case 'typescript':source=`// ${comment}\nexport interface DesignPiece {kind:string;text:string;x:number;y:number;w:number;h:number;fill:string;color:string;}\nexport const pieces: DesignPiece[] = ${JSON.stringify(nodes,null,2)};\n// Connect a renderer to these typed layout descriptions.`;break;
  case 'astro':source=`---\n// ${comment}\nconst pieces = ${JSON.stringify(nodes,null,2)};\n---\n<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><main class="design-frame">{pieces.map((p) => <div>{p.text}</div>)}</main></body></html>\n<style>.design-frame {max-width:${doc.canvas.width}px;margin:auto;background:${doc.canvas.background};padding:24px}</style>`;break;
  case 'solid':source=`// ${comment}\nimport {For} from 'solid-js';\nconst pieces=${JSON.stringify(nodes,null,2)};\nexport default function App(){return <main style={{'max-width':'${doc.canvas.width}px',margin:'auto'}}><For each={pieces}>{(p)=><section>{p.text}</section>}</For></main>;}`;break;
  case 'kotlin':source=`// ${comment}\nimport androidx.compose.material3.Text\nimport androidx.compose.runtime.Composable\nimport androidx.compose.foundation.layout.Column\n@Composable fun Study0SGDraft(){Column {\n${nodes.map(n=>` Text(${JSON.stringify(n.text)})`).join('\n')}\n}}\n// Replace this vertical starter with responsive Compose layout and logic.`;break;
  case 'flutter':source=`// ${comment}\nimport 'package:flutter/material.dart';\nclass Study0SGDraft extends StatelessWidget {const Study0SGDraft({super.key});@override Widget build(BuildContext context){return Scaffold(body:SafeArea(child:ListView(children:[\n${nodes.map(n=>`Text(${JSON.stringify(n.text)}),`).join('\n')}\n])));}}\n// Add responsive widgets, semantics and tested navigation.`;break;
  case 'golang':source=`// ${comment}\npackage main\nimport "fmt"\nfunc main(){\n${nodes.map(n=>` fmt.Println(${JSON.stringify(n.text)})`).join('\n')}\n}\n// Go is for backend logic; build authenticated HTTP handlers separately.`;break;
  case 'rust':source=`// ${comment}\nfn main() {\n${nodes.map(n=>` println!(${JSON.stringify(n.text)});`).join('\n')}\n}\n// Build an authenticated Rust API service separately; no web UI is generated.`;break;
  case 'ruby':source=`# ${comment}\nwidgets=${JSON.stringify(nodes.map(n=>n.text))}\nwidgets.each { |widget| puts widget }\n# For HTML, use Rails/Sinatra with escaped ERB output and tested routes.`;break;
  case 'elixir':source=`# ${comment}\nwidgets = ${JSON.stringify(nodes.map(n=>n.text))}\nEnum.each(widgets, &IO.puts/1)\n# For production use Phoenix LiveView, enforce server-side permissions.`;break;
 }
 return {filename:`Study0SG-starter.${ext[target]}`,source,explanation};
}
