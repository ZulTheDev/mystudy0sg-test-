# Study0SG v1.7 — Mobile-first Organizer Portal and Announcements

## What has changed

- **Phone bottom navigation:** Home, Updates, Chat, Tasks, More, with at least 48px touch targets and bottom safe-area spacing.
- **Slide-out workspace menu:** Full department navigation without covering the dashboard on small screens; sign-out remains available inside the drawer.
- **Announcements:** Unread badge next to the bell, persistent Home preview, special banner for unread urgent notices, and a dedicated inbox where volunteers explicitly mark messages read.
- **Manager publishing:** Fore Director may publish to everyone or a department. Directors may publish ONLY to departments where they have active Director grants. Every publication is audited. Other volunteers can read notices they are authorized to receive.
- **Phone-friendly forms and cards:** Better column stacking, scrollable data tables, chat layout, canvas boundary containment and dark-mode coffee colors.
- **Add to Home Screen:** A small web app manifest and install icons. This does NOT store private data offline and does NOT implement background push notifications.

### Important delivery limitation

**This version does not send phone push alerts when the app is closed.** Updates appear as soon as a volunteer opens the portal; when a session remains open, the app refreshes when it regains focus, listens for Supabase Realtime events where configured, and polls roughly every 45 seconds while visible. For guaranteed off-app delivery, add opt-in web push with a service worker and VAPID, or a consented email notification fallback, separately. On iPhone, web push requires users to add a supported PWA to the Home Screen and grant notification permission; your app must meet platform prerequisites first.

## Which files changed

- `src/App.tsx` — drawer, bottom bar, bell, banner and announcement navigation.
- `src/modules/Announcements.tsx` — inbox, read receipts, publisher, update polling and realtime.
- `src/styles/09-mobile-announcements.css` — mobile styling and announcement cards.
- `src/styles.css` and `src/styles/00..08*` — retains earlier modular coffee theme.
- `config/portal.permissions.json` — makes Announcements available to all authenticated organizers.
- `supabase/migrations/20261014100000_mobile_announcements.sql` — new tables, access policies and authorized RPCs.
- `index.html`, `public/manifest.webmanifest`, `public/icons/` — optional Home Screen shortcut visuals.
- `scripts/test-mobile.mjs` — source-level safeguards.

## 1. Backup working app

Copy your current working portal to a safe folder. Keep `.env.local`, `supabase/signing_keys.json`, your real JWT keys and all private credentials OUT of public GitHub. Do not replace the existing Stytch or Supabase configuration.

## 2. Apply the source

If upgrading from v1.6 with the modular coffee theme, unpack the **patch** over your project root, preserving its folder paths. If you have local modifications to `src/App.tsx` or styles, review the changes first rather than blindly overwriting.

### SQL schema installation — no Docker required

From Supabase Dashboard → project `dopycejsyfwafgexbeia` → SQL Editor, first confirm your existing v1.6 migrations are installed. **Back up the schema and organizer data using a suitable independent backup procedure before migrating.**

Run **only this new SQL migration**, once:

`supabase/migrations/20261014100000_mobile_announcements.sql`

This creates two new tables (`v17_announcements` and `v17_announcement_reads`) and three database RPCs. It does not alter any of your eight original tables or reset organizer permissions.

It deliberately does **not** create an Edge Function. Run these read-only checks in SQL Editor:

```sql
SELECT to_regclass('public.v17_announcements') AS announcements_table,
       to_regclass('public.v17_announcement_reads') AS read_receipts_table,
       to_regprocedure('public.v17_announcements_inbox()') AS inbox_function;
```

**Do not** call `v17_announcements_inbox()` from SQL Editor to test signed-in volunteer visibility: SQL Editor uses elevated DB privileges and is not an actual Stytch organizer session. Test from your signed-in browser instead.

### Windows PowerShell tests

```powershell
npm ci --include=optional
npm run typecheck
npm run test:mobile
npm run check:nav
npm run test:studios
npm run test:security
npm run build
npm run dev
```

If Vite native dependencies fail on Windows, ensure Node.js is compatible with the package engines, then perform a clean `npm ci --include=optional`. You do NOT need Docker.

## 3. Test with real phones

1. In desktop Chrome, open F12 → Device Toolbar and try widths **320, 375, 390, 430 and 768 pixels**. Verify the 5-item bottom bar, sidebar drawer, and no page-wide horizontal scrollbar.
2. On a test deployment with HTTPS, open the portal from Android Chrome or iPhone Safari. **Local `127.0.0.1` on your Windows computer does not reach the phone.** Stytch callbacks also need the correct allowed origin.
3. Log in as **Fore Director** and publish a short, non-sensitive `Important` or `Urgent` announcement with the audience `All organizers`.
4. Sign in as another organizer on a different device. The Updates badge and dashboard preview should show the notice. Tap Updates → **Mark as read**. Reopen the portal: the read receipt must persist.
5. Sign in as a Media Director, publish to Media only, then verify Community staff cannot read that Media-specific notice. A regular volunteer must not be able to publish at all.
6. Open dark and light modes, read a long message, test at 200% browser zoom, and confirm focus and keyboard navigation work.
7. Add the site to your Android Home Screen using Chrome's menu; on iPhone, use Safari → Share → Add to Home Screen. This is a shortcut, not background push delivery.

## 4. Helpful support notes

- If the announcements screen says `function v17_announcements_inbox does not exist`, the v1.7 migration was not applied, or the PostgREST schema cache hasn't reloaded.
- If it returns 401 or 403, check the portal JWT and organizer grants; don't disable RLS.
- If counts only update when manually refreshed, verify Supabase Realtime is working; the 45-second visible-tab polling fallback is intended.
- Avoid using global chat for urgent notices: chat can be buried. The Announcements inbox stores durable read receipts.
- Never publish personal student data, guardian contacts, access tokens or internal incident secrets in announcements.

## 5. Later upgrade: notifications while app closed

For volunteers who cannot check the portal often, the next privacy-aware phase should add opt-in email or Web Push. It will need user notification preferences, audit logs, delivery retry/queueing, opt-out controls, push subscription validation, limited message previews on lock screens, and device testing (especially iOS Home Screen requirements). An announcement marked `Urgent` should not be represented as delivered to a person merely because it was published.

## Validation performed in this delivery

- TypeScript check: passed.
- Navigation and existing security/studio source tests: passed.
- CSS parsed with PostCSS: passed.
- Additional mobile/announcement source safeguards: passed.
- SQL migration execution against Supabase: **not performed**; execute in staging first.
- Live phone testing and actual message deliveries: **not performed**.
- Full Vite production build in this Linux environment: blocked by missing Linux Rolldown native binary in the provided Windows dependency cache. Build on Windows as described above.
