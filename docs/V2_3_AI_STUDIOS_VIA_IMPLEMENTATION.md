# Study0SG portal — v2.3 implementation plan (test-bed)

This document defines requested functionality. It does not activate third-party integrations, issue credits, or grant role permissions. The current GitHub main branch is older than the uploaded v2.2 ZIP; the pending migration needs review.

## AI: two separate workspaces

**Personal:** private persistent organiser history, up to 10 standard messages per day and four Pro messages per calendar month. Server-enforced transactional quotas; no trust in browser counters.

**Organisation:** only EXCO, Directors and Fore Directors create top-level project folders; every verified organiser may create nested chats and branches. Messages preserve author, time, parent, reply links, and stable colour by author ID. All access is controlled by Supabase RLS and backend functions.

**Tech and Security:** specialist consultant profile available to authorised Tech and Security users; never include credentials or rely on model output as security approval. Remove registration/onboarding suggestions for verified organisers.

Current assistant export remains **session-only**. Do not describe it as persistent chat history.

## EDM and Wireframe Studio

Single responsive fullscreen canvas, dynamically sized artboards, draggable multiple frames in Wireframe, collapsible logo navigation and on-demand floating toolbars. Top centre: share, save and export actions. Component selection opens style and logic inspector, not always-visible panels.

EDM tools: template size/style; shapes (basic, polygons, lines, abstract); R2/Drive/media upload tabs; mascot and brand stickers; font effects, styles and text adjustments. Browser imports expire after seven days and must not be uploaded automatically.

Fabric.js supports group transforms and text controls. Dexie is for offline local state. Yjs requires an authenticated collaboration provider and document permissions. Workbox can cache static assets but must not cache authenticated responses.

Piscina only runs in a Node.js backend: use browser Web Workers for heavy client-side object processing, and Piscina for separately hosted server processing.

Wireframe: interactive frames, properties, Scratch-style logic cards only on request, stylesheet inspector, API component logic, responsive viewpoint preview, performance audit and a mini Tech assistant. Requested generators: TypeScript, Kotlin, Elixir, Go, Rust, Ruby, JS, CSS, HTML, Flutter, Astro, React and Solid. Any unsupported generators must be labelled experimental.

## VIA activity evidence and review

Directors can add/edit pending departmental claims; Fore Directors can add/edit and approve/reject, with no self-approval. Enforce permissions in SQL / Edge Functions, not just UI. Store meaningful task state changes and review evidence, not browsing surveillance or idle time.

AI drafts formal editable letters; independent reviewer sets approved minutes. Review must be idempotent to prevent repeated ledger awards. Internal exports must not claim Singpass verification, LEAPS 2.0 approval, or school accreditation.

Actual Singpass integration requires explicit authorised provider setup, user consent, privacy compliance and acceptance by the receiving institution. It is **not configured** by adding a button.

## Privacy and release checklist

Never commit credentials, personal student records, or tokens to docs. Place private implementation decisions and configuration procedures in access-restricted internal documentation, rather than public Markdown in this repository. Use server-side secrets and least-privilege service roles.

1. Review and merge the uploaded v2.2 ZIP changes into a separate tested PR before replacing old live components.
2. Test migrations, row-level security, quota races, message history, branches and role matrix in staging.
3. Integrate studios separately with regression tests for mobile layout, accessibility and collaboration.
4. Implement approved identity flow only after contractual and technical verification.
5. Build, test and check deploy preview before merging to main.

## Scope of the current PR

This PR makes a small, real change: removes the irrelevant assistant onboarding suggestion; provides session transcript Markdown export and reset. It also documents the larger feature requirements. **The full organisation AI workspace, editors and Singpass verification are NOT implemented in this PR.**
