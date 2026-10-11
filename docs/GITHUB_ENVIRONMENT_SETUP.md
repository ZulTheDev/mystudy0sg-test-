# GitHub Actions environment setup, beginner steps

GitHub repository for STAGING: https://github.com/ZulTheDev/mystudy0sg-test- (currently public).

1. Open the repository > Settings > Environments > New environment > `staging`.
2. Add **Environment variables** (not secrets) with these names and their actual public values:
   - `STAGING_STYTCH_PUBLIC_TOKEN` = Stytch Test public token
   - `STAGING_STYTCH_ORGANIZATION_ID` = Test organization ID
   - `STAGING_SUPABASE_URL` = `https://dopycejsyfwafgexbeia.supabase.co`
   - `STAGING_SUPABASE_PUBLISHABLE_KEY` = `sb_publishable_...` from Test project
3. Keep service credentials out of GitHub Pages build. The server secrets belong in **the matching Supabase Edge Functions project** (see `EDGE_FUNCTION_SECRETS.example`). GitHub **Secrets** are only needed for CI jobs that perform privileged actions, not for `VITE_` build settings.
4. Open Settings > Pages > Build and deployment > GitHub Actions.
5. Push reviewed source to Test repo, then manually run Actions > `Deploy organizer portal to staging Pages` > Run workflow.
6. Expected site URL: `https://zulthedev.github.io/mystudy0sg-test-/` (it won't exist until Pages is enabled and deployed).
7. Stytch Test authorized redirect URL includes the path; Supabase `PORTAL_ORIGIN` contains only `https://zulthedev.github.io`.
8. When production is ready, use a separate production repo/environment, NEVER switch these staging values to Live while this test repo remains your staging portal.
