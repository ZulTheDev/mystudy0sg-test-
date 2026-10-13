// Lightweight source/asset safeguards. Does not replace browser or database testing.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const read=(p)=>fs.readFileSync(p,'utf8');
const app=read('src/App.tsx');
const inbox=read('src/modules/Announcements.tsx');
const sql=read('supabase/migrations/20261014100000_mobile_announcements.sql');
const css=read('src/styles/09-mobile-announcements.css');
const perms=JSON.parse(read('config/portal.permissions.json'));
const manifest=JSON.parse(read('public/manifest.webmanifest'));
assert(perms.base.includes('announcements'),'Announcements should be visible to all organizers');
assert.equal(perms.modules.announcements,'Announcements');
for(const name of ['mobile-bottom-nav','mobile-nav-backdrop','mobile-menu-toggle','mobile-drawer-signout','urgent-announcement-banner']){
 assert(app.includes(name),`Missing mobile interface: ${name}`);
}
for(const name of ['v17_announcements_inbox','v17_announcement_publish','v17_announcement_mark_read']){
 assert(sql.includes(name),`Missing secured SQL operation: ${name}`);
}
assert(sql.includes('ENABLE ROW LEVEL SECURITY'),'Announcements require RLS');
assert(sql.includes("public.has_grant('fore_director'::public.portal_role)"),'Global posts must require Fore Director');
assert(sql.includes('public.can_review_department(p_department)'),'Department posts must require management');
assert(sql.includes('GRANT SELECT ON public.v17_announcements TO authenticated'),'Realtime reads must be access-scoped');
assert(sql.includes('CREATE POLICY v17_announcements_view'),'Realtime must be limited by RLS');
assert(sql.includes('ON CONFLICT DO NOTHING'),'Read receipts must be idempotent');
assert(inbox.includes("if(document.visibilityState==='visible')"),'Do not poll in hidden tabs');
assert(inbox.includes('45_000'),'Expected low-frequency polling fallback');
assert(css.includes('env(safe-area-inset-bottom'),'Bottom bar must account for phone safe areas');
assert(css.includes('min-height: 48px'),'Mobile touch targets should be large');
for(const icon of manifest.icons){
 const p=path.join('public',icon.src.replace(/^\.\//,''));
 assert(fs.existsSync(p),`PWA icon missing: ${p}`);
}
assert(!read('index.html').includes('href="/manifest.webmanifest"'),'Manifest must resolve under GitHub Pages subpaths');
console.log('PASS: mobile navigation, announcement authorization invariants, safe-area styles, and install icons');
