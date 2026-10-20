# Study0SG v2.3 — staging release and QA

Target: ZulTheDev/mystudy0sg-test- only. Do not merge or deploy to production until the staging checks pass.

## AI workspace implemented
- Separate personal and organisation views with SQL-backed folders, nested threads, history and Markdown exports.
- Project folder creation is restricted to Fore Directors, Directors and verified executive team grants. Verified organisers may add and branch chats.
- Personal Standard: 10 messages per UTC day. Personal Pro: 4 messages per UTC calendar month. Quotas are checked atomically in a database function.
- Author names and stable colours are shown; Tech & Security assistant is available only to authorised roles.
- AI provider credentials remain on an Edge Function. Browser-facing tables are read-only; writing uses guarded RPCs.

## Studios implemented
- EDM and Wireframe now use Fabric.js to move, select and resize objects with text boxes and groups.
- Editable artboard width and height: 320–2400 pixels. Size presets and Fit zoom are available.
- Wireframe palette includes resizable frame objects inside the primary artboard; independent multi-page exports are not implemented.
- Controls are in collapsible tool panels; the properties panel appears on selection and logic tools are on demand.
- Yjs synchronises individual node changes between members with authenticated Supabase Realtime rooms.
- Existing versioned database save, share invitations and revision conflict warnings remain intact.

## Deploy to staging (manual)
1. Run npm ci and npm run build. Inspect the verify-build workflow for Windows and Ubuntu.
2. Back up the **test** Supabase database before applying the migrations.
3. Apply supabase/migrations/20261020180000_ai_personal_shared_workspace.sql.
4. Apply supabase/migrations/20261020181000_studio_yjs_realtime_acl.sql only if the staging project supports Realtime broadcast RLS and has v16_studio_members.
5. Set the Edge Function secrets PORTAL_ORIGIN, PORTAL_ALLOWED_ORIGINS, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, PORTAL_ISSUER, OPENAI_API_KEY. Optional: OPENAI_CHAT_MODEL and OPENAI_PRO_MODEL.
6. Deploy supabase/functions/ai-workspace to the **test** Supabase project; never expose service credentials to the frontend.
7. Check two authorised editors and one read-only viewer on separate browsers/devices.

## Checks before approving the PR
- [ ] CI TypeScript/build passes on both runner operating systems.
- [ ] Organiser A cannot read organiser B's private chats.
- [ ] Member without EXCO/Director status cannot create a project folder.
- [ ] Authenticated member can branch a project thread and its content reopens after sign-out.
- [ ] Daily and monthly quotas hold during concurrent requests.
- [ ] Tech advisor cannot be used by unauthorised roles.
- [ ] Saved EDM/wireframe dimensions remain unchanged after reopening a document.
- [ ] Text, images and shape resize handles work on desktop and mobile.
- [ ] Yjs sends changes only to entitled editors; read-only viewers cannot broadcast.
- [ ] Network interruptions do not erase previously saved revisions.

## Known limits
Live Yjs broadcasts are not a persistent collaboration server: save a revision explicitly. Offline Dexie and Workbox state restoration are not included. Cloudflare R2/Google Drive media browsing, advanced text effects, every requested language generator and Singpass integration are outside this PR. No official VIA/LEAPS approval feature is implied. Do not store sensitive student records or credentials in this public documentation.
