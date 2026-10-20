// Static regression checks for the exact UI regression reported in October.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const app=read('src/App.tsx');
const css=read('src/styles/12-immersive-workspaces.css');
const edm=read('src/modules/MediaEdm.tsx');
const wire=read('src/modules/TechStudio.tsx');
const ai=read('src/modules/Knowledge.tsx');
const permissions=JSON.parse(read('config/portal.permissions.json'));
const workflow=read('.github/workflows/deploy-org-dev.yml');
assert.match(app,/workspace-layout--studio/,'Studios must have an explicit full-screen portal layout');
assert.match(app,/workspace-layout--ai/,'Assistant needs a distinct wide workspace');
assert.match(css,/workspace-layout--studio\s*>\s*\.workspace-nav/,'Studio navigation sidebar must be hidden');
assert.match(css,/resize:vertical/,'Canvas viewport must be vertically resizable');
for(const module of [edm,wire]){
 assert.match(module,/FabricStudioCanvas/,'Both studios must use Fabric.js');
 assert.match(module,/studio-settings-drawer/,'Project settings must be collapsible');
 assert.match(module,/studio-floating-actions/,'Editing controls must float by the artboard');
}
assert.match(ai,/My personal AI/,'Personal AI must have a visible entry point');
assert.match(ai,/Team projects/,'Organisation AI must have a visible entry point');
assert.ok(permissions.base.includes('rag'),'All verified organisers should see AI');
assert.match(workflow,/push:\s*\n\s*branches:\s*\[main\]/,'Merge to main must automatically publish staging');
console.log('PASS: full-screen studios, collapsible toolbars, AI navigation and test-bed deployment');
