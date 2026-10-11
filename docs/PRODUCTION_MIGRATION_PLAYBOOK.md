# Study0SG production migration playbook (release candidate, NOT deployed)

## Current state observed 11 October 2026
- Staging test GitHub repository: https://github.com/ZulTheDev/mystudy0sg-test- is **public**, **empty** and accessible. We have NOT pushed to it.
- Official website repository: https://github.com/study0SG/study0SG.github.io is **not accessible** through the connected GitHub account. Do not overwrite this repository: it is meant for the public education website, NOT the private organizer portal.
- Source baseline: Study0SG mobile v1.7 plus logo component. v1.8 adds release configuration, not a working Google Drive file broker.
- Supabase project dopycejsyfwafgexbeia is TEST, not production.

## Architecture
1. Staging portal: `ZulTheDev/mystudy0sg-test-` GitHub Pages on `https://zulthedev.github.io/mystudy0sg-test-/`, with staging Supabase and Stytch Test.
2. Production portal: recommend a distinct organization repository `study0SG/mystudy0sg-portal` (create it as private if possible), deployed to a separate HTTPS portal origin. DO NOT replace `study0SG.github.io` educational website with organizer portal.
3. Supabase: two projects. Provision production as a NEW project. Apply reviewed schema migrations in order (never run historic migrations indiscriminately). Bootstrap approved production organizers; no production participant test data.
4. Stytch: Live project keys, Live Study0SG organization, Live redirect URLs, invitation-only JIT settings, MFA required for sensitive roles, appropriately short sessions, harden account recovery. Test organization/member IDs are NOT Live IDs.
5. Link production member identities to organizer UUIDs using the production HMAC pepper in the production `identity_links` table. Do NOT copy existing Stytch Test digests: identity linking depends on the environment, member ID, organization ID and pepper.
6. JWT: production Supabase signing key must match `PORTAL_JWT_PRIVATE_JWK` (with `kid`) and issuer in all portal verification functions. Never commit private JWK. Rotate keys only through planned rollout with verification.
7. Google Drive: keep 1 backend Google account + 1 main Study0SG account. OAuth owner authorization needed for personal My Drive; this release only documents IDs, it does NOT grant Drive access to your portal yet.
8. Any services using `PORTAL_ORIGIN` support exactly one origin. Set staging secrets on staging Supabase and production secrets on production Supabase; do not point both sites at the same production database.

## Staging deployment
1. Locally on Windows, unzip source. `npm ci --include=optional`; `npm run typecheck`; `npm run check:nav`; `npm run test:studios`; `npm run test:security`; `npm run test:mobile`; `npm run build`.
2. Create `.env.local` from `.env.staging.example`, insert PUBLIC Stytch Test token and PUBLIC staging Supabase publishable key. Do not commit `.env.local`.
3. Create or clone the TEST repo. Copy **only** the allowlisted release source (no `node_modules`, no private docs or credentials).
4. From the cloned repository `git status`, `git add` selective files, `npm run check:staged`, `git diff --cached --stat`, `git diff --cached`, then `git commit -m "Study0SG staging release candidate"`, `git push origin main`. Avoid `--force`.
5. In GitHub repo Settings > Environments > staging, set VARIABLES (not secrets): `STAGING_STYTCH_PUBLIC_TOKEN`, `STAGING_STYTCH_ORGANIZATION_ID`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY`. They become public in built JS.
6. GitHub repo Settings > Pages > Build and deployment > Source: GitHub Actions. Run the workflow `Deploy organizer portal to staging Pages` **manually** in Actions.
7. In Stytch Test dashboard, add the EXACT allowed HTTPS staging redirects including path `https://zulthedev.github.io/mystudy0sg-test-/`; configure the organizer B2B project and invitation-only joining. Set Edge `PORTAL_ORIGIN=https://zulthedev.github.io` (origin only, no path). Check origin and callback configuration separately.
8. Test on mobile and desktop: sign-in, identity-exchange, RLS on every department, tasks, files (where implemented), announcement visibility, logout, realtime, PWA, Buffer queue approval, service-hours and audit trails. Ensure no secret or participant data appears in the GitHub tree, action logs, JS bundle, or Pages.

## Production promotion checkpoints
- Get access to a distinct production ORGANIZER repo and dedicated HTTPS portal origin. The website repository should stay separate.
- Create a production Supabase project and live Stytch organization; collect all NEW public and private credentials independently; never reuse Test secrets or JWT signing keys.
- Create / confirm production DB schema and RLS on a clean project with reviewed migration ordering and backups. Spot-check permission RPCs.
- Invite real organizers via Live Stytch and link each Live member ID to a production organizer UUID using the PRODUCTION pepper. Revalidate Fore Director MFA, the dual-department director grants, and account recovery before allowing live data.
- Configure GitHub production environment with required reviewer(s) if supported, branch protection, code scanning, and separate deployment secrets. No direct frontend access to private API keys.
- Configure Live Stytch allowed redirects, SDK policy, invitation-only organization creation, MFA; production `STYTCH_API_BASE=https://api.stytch.com` and `PORTAL_ENVIRONMENT=production`. In production the patched `identity-exchange` refuses test identities.
- Audit all Edge Functions that use direct Stytch or custom JWT verification, including revocations and issuer match. Deploy to NEW production Supabase project only after review.
- **Known production blockers requiring code work**: `public-apply` currently has a placeholder email verification worker (receipt alone does not establish email ownership); `media-presign` has a quarantine uploader but no connected verified finalization/scan flow; Google Drive storage broker is not implemented. Do not activate these for real applicants/minor participants yet.
- Check Stytch SDK Discovery behavior: organization creation and unapproved JIT provisioning must be disabled in the Stytch Live project and the server must accept only the Live Study0SG organization.
- Validate independent backups, accessibility, mobile notification delivery, environment health, signed JWT, RLS, regressions, and rollback by redeploying previous frontend artifact. Database rollback may require forward corrective migration.
- Only then deploy the separate production portal GitHub Pages workflow, in a reviewed PR and approved manual release.

## Do NOT
- Copy Test project `dopycejsyfwafgexbeia` credentials into production.
- Copy Test Stytch member ID or organization ID, identity digests, sandbox participant records, or sandbox OpenAI/Buffer secrets into Live.
- Put `STYTCH_SECRET`, `PORTAL_JWT_PRIVATE_JWK`, `PORTAL_IDENTITY_PEPPER`, `OPENAI_API_KEY`, OAuth refresh tokens, Google service account private keys, service-role API keys or GitHub App private keys into `VITE_` variables.
- Use production credential set on the public staging repo.
- Call a dashboard deployment production-ready until end-to-end authentication and RLS have passed.
