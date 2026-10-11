# Study0SG Portal — v1.8 release candidate (NOT production deployed)

Source baseline: v1.7 mobile portal + logo integration. This pack adds production/staging configuration templates, a verified Drive folder map, a backend Stytch production guard, a staging GitHub Pages workflow and migration documentation. It does **not** implement Drive uploads, migrate databases, or switch Stytch to Live. `public-apply` email verification and quarantined media finalization are not production-complete.

Start here: `docs/PRODUCTION_MIGRATION_PLAYBOOK.md`, then `docs/GITHUB_ENVIRONMENT_SETUP.md` and `docs/PLATFORM_ACCOUNT_MATRIX.md`.

Local: `npm ci --include=optional`, `npm run typecheck`, `npm run test:mobile`, `npm run build`.
Public env examples: `.env.staging.example`, `.env.production.example`.
Private Edge secret placeholders: `docs/EDGE_FUNCTION_SECRETS.example` (do not fill inside the repo).
Drive IDs: `docs/GOOGLE_DRIVE_FOLDER_IDS.env.example`.

**Caution:** The production repo `study0SG/study0SG.github.io` is not accessible through the connected GitHub account, and is intended for the public website. Neither GitHub repo has been modified by this release preparation.
