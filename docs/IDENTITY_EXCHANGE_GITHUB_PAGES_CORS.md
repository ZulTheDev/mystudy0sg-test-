# Study0SG: fix GitHub Pages CORS for organizer sign-in

The browser origin of `https://zulthedev.github.io/mystudy0sg-test-/` is **`https://zulthedev.github.io`** (no repository path).

The deployed `identity-exchange` function currently returns `Access-Control-Allow-Origin: http://localhost:5173` because the Dev project's `PORTAL_ORIGIN` is configured for localhost. That mismatch blocks the browser's preflight `OPTIONS` request before Stytch session exchange.

## Required dev-only Edge Function Secrets

In **Supabase Study0SG-dev → Edge Functions → Secrets**, set:

```dotenv
PORTAL_ORIGIN=https://zulthedev.github.io
PORTAL_ALLOWED_ORIGINS=http://localhost:5173
```

- `PORTAL_ORIGIN` is used by other Study0SG Edge Functions that still accept only one origin. Setting it to the GitHub Pages **origin** lets those endpoints serve your staging web app.
- `PORTAL_ALLOWED_ORIGINS` is a new optional, comma-separated origin allowlist for `identity-exchange`. Only exact matches are allowed. It keeps local development available for that function.
- If you also test on other exact hosts, add their origins to `PORTAL_ALLOWED_ORIGINS` after reviewing them (for example, `http://127.0.0.1:5173`). No `*` or URL path.
- Do not change `PORTAL_ISSUER` or your signing key as part of this CORS repair. Their values must remain consistent with the JWT verification configuration.
- Do **not** add private secrets to `VITE_*` variables or the public GitHub repository.

## Deploy the patched function

Merge the PR, open a local terminal at the repository root, and deploy to the **dev Supabase project only** (verify the ref in your Supabase dashboard before running):

```powershell
npx supabase functions deploy identity-exchange `
  --project-ref dopycejsyfwafgexbeia `
  --no-verify-jwt
```

The `--no-verify-jwt` setting preserves the existing function's custom Stytch session verification. It is not a general instruction to disable function authentication elsewhere.

## Validate safely

In Chrome DevTools → Network, inspect the `identity-exchange` `OPTIONS` request:
- **Status:** 204
- **Access-Control-Allow-Origin:** `https://zulthedev.github.io`
- **Access-Control-Allow-Headers:** contains `content-type` and `apikey`

Then verify the `POST` request is no longer blocked by CORS. A subsequent `401` or `403` indicates real authorization conditions (Stytch session, MFA, identity link, etc.), not the old browser-origin mismatch.

You can test preflight without transmitting a real user token:

```powershell
curl.exe -i -X OPTIONS "https://dopycejsyfwafgexbeia.supabase.co/functions/v1/identity-exchange" `
  -H "Origin: https://zulthedev.github.io" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: apikey,content-type"
```

## Other functions and production

Other portal Edge Functions may also rely on `PORTAL_ORIGIN` (for example the chatbot and media upload API). This staging change points their primary origin at GitHub Pages, while **local requests to those unpatched endpoints may still be blocked**. Those functions need the same explicit allowlist pattern if both environments must operate concurrently.

Production should use its own Supabase project, Live Stytch organization, and exact production origin. Never copy the dev allowlist into production without review.

This PR only modifies Edge Function source and this guide; it does not deploy changes or modify any Supabase secret.
