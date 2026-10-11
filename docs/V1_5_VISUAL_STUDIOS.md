# Study0SG v1.5 — Visual Studios Beta

## What changed from v1.4.2

- **Tech & Dev → Wireframe Builder:** free-position 960×600 editor, 12 components, draggable / resizable shapes, keyboard arrow nudging, grid, layers, property inspector, undo/redo, Scratch-style event blocks, explicit interactive preview, JSON/SVG export, documented standalone React `.tsx` generation, and a plain-English service map.
- **Media / Tech & Media → EDM Studio:** free-position 700×700 poster editor, independently movable elements (text, call-to-action, circles, rectangles, stickers, images), resize handles, layers, text/fill/font controls, undo/redo, PNG (2x), SVG and editable JSON export.
- Existing PostgreSQL RPC `v14_save_studio` persists small layout documents, without any new tables/migrations. Existing v1.4.1 documents open through automatic format conversion; save upgraded versions after opening.
- Independent tools stay behind current role-based navigation. No direct public publishing, database writes from generated code, or exposure of private participant records.
- Browser rendering uses native SVG + React, **no heavy design editor package**. RequestAnimationFrame limits canvas drag updates to animation frames.
- **Micro WASM:** `public/wasm/snap.wasm` compiled from `src/studio/snap.c` implements only optional snap-to-grid integer math. Loads lazily upon visiting either studio; falls back to JS if unavailable. WASM has no imports, network or confidential information.
- Both editors are `React.lazy()` split bundles; the authenticated portal's initial navigation does not load editor JavaScript. External Google Fonts CSS request removed for reduced network dependency and render blocking.

## Installation on your current working portal (preferred)

1. **Back up your current working source**, especially `src/App.tsx`, `src/styles.css`, `.env.local` and files you modified. Do not copy or commit environment secrets into public repositories.
2. Extract `Study0SG_Visual_Studios_Patch_v1_5.zip` into the root of your existing v1.4.2 portal, preserving relative directory paths:
   - `src/App.tsx`
   - `src/styles.css`
   - `src/modules/TechStudio.tsx`
   - `src/modules/MediaEdm.tsx`
   - every file in `src/studio/`
   - `public/wasm/snap.wasm`
   - `scripts/test-studios.mjs`
   - `package.json` and `package-lock.json` (only version/scripts changed, no new root dependencies).
3. In Windows PowerShell (from the portal root), run:

   ```powershell
   node --version
   npm ci --include=optional
   npm run typecheck
   npm run test:studios
   npm run build
   npm run dev
   ```

   Node 22.12 or newer on Node 22 is recommended. If `npm ci` fails, inspect the **first** error. Do not delete the lockfile or change database keys in response to a native bundler issue.
4. Sign in as Fore Director or a properly authorized member. Navigate to **Tech & Media → Wireframe Builder** or **Media Studio → EDM Studio**. Test drag/resize, property changes, undo/redo, logic preview, save/reopen and exports.
5. No new Supabase migration, Stytch configuration, Edge Function or GitHub App installation is needed. The earlier **v1.4.1 operational workspace migration** must already exist for saving drafts.

## Beginner-friendly usage

**Wireframe:** Click **+ Heading** or **+ Button**, select and drag its rectangle, drag its orange lower-right handle to resize, then edit its text and colors in **Object settings**. Add a logic block: **When someone clicks [button] → Do show a message [text]**. Open **Interactive preview**, press **Start preview**, then click the button. Export **React code** and give it to a Tech & Dev reviewer. It is a *starter component*, not a ready-to-publish secure app.

**Poster:** Add a heading, badge, shapes or sticker. Adjust individual colors and positions. Add an **Image** element and upload a small PNG/JPEG/WebP (max 450 KB). Export **SVG**, **PNG** or editable **JSON**. For any event publication, prepare a **publishing review request** instead of assuming external APIs are configured.

## Known constraints and privacy notes

- The Supabase SQL function `v14_save_studio` limits JSON documents to **50 KB**. The studios reject saves around 38 KB to leave space for database encoding overhead. **Uploaded photos are not saved in Supabase**; they remain local within the open editor and are included in SVG/PNG/JSON exports. Save your editable JSON locally for photo-heavy posters. Future persistent image assets should use a private Supabase Storage bucket, with role-scoped signed URLs, size/type validation and review.
- Preview logic allows only predefined actions (show message, toggle visibility, change text, open HTTPS). It deliberately does not `eval`, execute arbitrary user JavaScript, submit participant information or authenticate anyone.
- `Open website` rules are HTTPS-only and open in a new tab; a generated app requires additional domain allowlists, content security policy, and proper validations.
- Source export approximates the canvas with percentage-based positioning. A developer must make layouts responsive and accessible, connect reviewed backends, test changes and create a PR. It does not generate a complete production application.
- Undo/redo is **session-local** and reset when a different design opens. Photos in downloaded SVG files are embedded as data URIs. Some vector software may handle embedded images differently; PNG may be more portable.
- Saved designs in v1.4.1 remain available for opening. Complex rich-text, AI image generation, team cursors, version history, multi-page responsive frames, text flow/auto-layout and direct social publishing are not yet implemented. This is a practical mini-editor, not a full Figma or Canva replacement.

## Astro integration decision

The **organizer portal remains React/Vite** because moving existing Stytch B2B authentication, portal JWT, Supabase RLS, internal navigation and admin workflows into Astro SSR would be a separate migration and security review. That is safer than silently replacing your working app.

Included **`examples/astro-public-site/`** is a standalone, static Astro prototype for the eventual public Study0SG event website. It does not connect to registrants or publish anything; it has its own optional `package.json`. You can explore it independently with `npm install && npm run build` from that example folder. Astro normally produces static HTML without JavaScript, and can load specific interactive components only when required via the islands model: https://docs.astro.build/en/concepts/islands/. This will be useful for the public marketing pages, but is not a substitute for secure participant-registration APIs.

## Performance validation — measurable goals, not promises

- **LCP < 2.5 seconds; INP < 200 milliseconds; CLS < 0.1**, measured at the **75th percentile** across real users. These are targets, not outcomes verified here.
- Lazy-load design studios (implemented), remove blocking remote Google Fonts import (implemented), avoid giant image uploads, reserve canvas dimensions to prevent layout shifts, keep client event handlers small (rAF drag). The tiny WASM helper does **not** automatically make the app faster than JS; it is a micro-example and can fall back to JS.
- Measure actual results in Chrome DevTools Lighthouse (mobile + desktop), Performance panel (long tasks, layout), Network (initial script bytes), and Chrome UX Report or the `web-vitals` client library when appropriate.
- **Validation performed:** `tsc --noEmit` passed; `test:studios` passed for data roundtrips, unique IDs, SVG escaping, and generated TypeScript syntax; generated `.tsx` passed full strict TypeScript checking in the existing portal; native WASM was compiled and exported. **Not performed:** full Vite bundling in this Linux environment (the available `node_modules` contains Windows-only Rolldown native binding), end-to-end browser drag tests, live Supabase saves, or Lighthouse testing. Run `npm ci --include=optional` and `npm run build` on your Windows PC.

## Security checklist before using posters/wireframes in production

- Keep Stytch/portal sessions and private keys out of saved wireframes or exported code.
- Do not put child/student names, NRICs, Singpass data, emails or participant spreadsheets in designs or GitHub.
- Review external links, image permissions, document access policies, and generated React code before merging.
- Keep Media publishing behind approvals; the editor's export review request is not a publishing API.
