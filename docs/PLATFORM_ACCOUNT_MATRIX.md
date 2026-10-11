# How many accounts/projects are needed?

## People-based Google accounts
- **2 Google accounts recommended now:** Study0SG official admin account + dedicated Study0SG backend Drive owner account. One account per department is NOT needed.
- **1 optional recovery admin later** with independent MFA/recovery access, ideally part of a managed Google Workspace organization rather than sharing a personal account password.
- Portal organizers each get their own **Stytch B2B Member** login, NOT a shared Google login.

## Technical identities and environments (not personal Google accounts)
- 1 Google Cloud project + a staging and a production OAuth client (or 2 Cloud projects for stronger separation); one backend-owner OAuth grant per authorized environment, not 6 OAuth accounts.
- 1 Stytch B2B project with separate Test/Live environments if supported by your plan; distinct organization and Member IDs in Test vs Live.
- **2 Supabase projects** recommended: 1 staging, 1 production, separate signing keys and secrets.
- **1 GitHub App**, installed only on specific approved repositories with least-privilege permissions; do not create service accounts per crew.
- **2+ GitHub repos**: public main education site and separate organizer portal. Test repo remains staging.
- **6 Drive work areas**, managed with back-end role checks, not separate Google users.
- Backend Google Drive broker is not yet implemented: the folder ID list is configuration only.
