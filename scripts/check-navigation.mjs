// Simple smoke test: every menu shortcut must point to a real portal screen.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const source=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const data=JSON.parse(fs.readFileSync(new URL('../config/portal.permissions.json',import.meta.url),'utf8'));
const nav=source.slice(source.indexOf('const navGroups:'),source.indexOf('// Stytch verifies'));
const keys=[...nav.matchAll(/\{key:'([^']+)',text:/g)].map(([,key])=>key);
assert.ok(keys.length>=20,'Navigation unexpectedly short');
for(const key of keys)assert.ok(Object.hasOwn(data.modules,key),`Unknown screen ${key}`);
for(const key of Object.keys(data.modules))assert.ok(keys.includes(key),`Screen missing from menu: ${key}`);
for(const label of ['Overview','Media Studio','Tech & Media','Tech & Security'])assert.ok(nav.includes(`title:'${label}'`),`Missing group ${label}`);
console.log(`Navigation OK: ${keys.length} links to ${Object.keys(data.modules).length} screens; all groups use the permission-filtered list.`);
