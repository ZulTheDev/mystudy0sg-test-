/** Standalone regression tests for exact-origin policy, no live credentials needed. */
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const ts = (()=>{try{return require('typescript');}catch{return require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');}})();
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(base,'..');
const policy=fs.readFileSync(path.join(base,'supabase/functions/_shared/cors.ts'),'utf8');
const source=ts.transpileModule(policy,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {portalAllowed,portalCors}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const parseEnv=(file)=>Object.fromEntries(fs.readFileSync(file,'utf8').split('\n').map(s=>s.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2]]));
const dev=parseEnv(path.join(root,'config/dev/supabase-edge-secrets.example'));
const prod=parseEnv(path.join(root,'config/production/supabase-edge-secrets.example'));
const browser=(origin)=>new Request('https://test.invalid',{headers:{Origin:origin}});
const tailscale='https://system32.tail39684d.ts.net';
let tested=0;
for (const [env,allowed,denied] of [
 [dev,[tailscale,`${tailscale}:5173`,`${tailscale}:5174`,`${tailscale}:8787`,'https://zulthedev.github.io','http://localhost:5173','http://localhost:5174','http://localhost:8787'],['https://study0sg.github.io','https://evil.example','http://localhost:5175']],
 [prod,[tailscale,'https://study0sg.github.io'],['http://localhost:5173','https://zulthedev.github.io',`${tailscale}:5173`,'https://evil.example']],
]){
 globalThis.Deno={env:{get:(name)=>env[name]}};
 for(const origin of allowed){assert.equal(portalAllowed(browser(origin)),true,`Missing ${origin}`);assert.equal(portalCors(browser(origin))['Access-Control-Allow-Origin'],origin);tested++;}
 for(const origin of denied){assert.equal(portalAllowed(browser(origin)),false,`Unexpected ${origin}`);assert.equal(portalCors(browser(origin))['Access-Control-Allow-Origin'],undefined);tested++;}
}
// Wrong format and wildcard must fail closed, not silently become a wildcard.
globalThis.Deno={env:{get:(name)=>name==='PORTAL_ORIGIN'?'https://valid.example/anything':name==='PORTAL_ALLOWED_ORIGINS'?'*,https://example.com/path':''}};
for(const origin of ['https://valid.example','https://example.com','https://evil.example']){assert.equal(portalAllowed(browser(origin)),false);tested++;}
console.log(`PASS: ${tested} exact CORS allow/deny cases (staging, production, malformed settings)`);
