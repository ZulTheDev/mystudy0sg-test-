# Study0SG — Repair `knowledge-chat` browser CORS preflight

## What failed

When the browser loads the organizer chat at `https://zulthedev.github.io/mystudy0sg-test-/`, it sends an `OPTIONS` preflight to `/functions/v1/knowledge-chat`.

The original function did `new Response(JSON.stringify(body), { status: 204 })`. A **204 No Content** response cannot contain a body; modern Fetch runtimes throw a `TypeError`. The function therefore did not reliably return `Access-Control-Allow-Origin`, even if `PORTAL_ORIGIN` was set correctly.

This PR fixes the 204 response body and enables the same exact-origin allowlist used by `identity-exchange`. It does **not** change Stytch authorization, document RLS, JWT authentication or the AI model.

## Dev Supabase secrets

In **Study0SG-dev > Edge Functions > Secrets**, set or verify:

```dotenv
PORTAL_ORIGIN=https://zulthedev.github.io
PORTAL_ALLOWED_ORIGINS=http://localhost:5173
```

- Use origins only: **no `/mystudy0sg-test-/` path** in CORS values.
- `PORTAL_ALLOWED_ORIGINS` may contain multiple comma-separated origins, but never `*`.
- Do not change `PORTAL_ISSUER` or JWT keys to solve a CORS error.
- The browser needs the Supabase publishable `apikey` and the signed short-lived organizer JWT. Never use the secret/service-role key in the frontend.

## Very important: which version of the function are you deploying?

1. **If your local `knowledge-chat/index.ts` starts `// Study0SG staff assistant: DeepSeek for text`**: you already have the AI **v1.9.1** patch installed. That version has both the explicit origin allowlist and the empty 204 response. **Deploy that local DeepSeek version directly**, and do **not** replace it with this older GitHub source, which still calls OpenAI for chat.
2. **If your local function starts `// Source-grounded Study0SG AI assistant`**: merge this PR, then pull and deploy the GitHub version. Note that this only resolves CORS; the assistant still requires `OPENAI_API_KEY` and indexed approved resources. Add the v1.9.1 DeepSeek patch separately when ready.

## Deploy to staging only

From your project root, after choosing the correct version:

```powershell
npx supabase functions deploy knowledge-chat `
  --project-ref dopycejsyfwafgexbeia `
  --no-verify-jwt
```

The `--no-verify-jwt` flag is used because this Edge Function **verifies the custom ES256 organizer JWT itself** through `_shared/portal-auth.ts`. Do not disable the internal verification.

If you select the DeepSeek v1.9.1 code, set the **backend** secret `DEEPSEEK_API_KEY`; optional legacy vector retrieval also requires `OPENAI_API_KEY`.

## Test preflight (never requires a login token)

```powershell
curl.exe -i -X OPTIONS "https://dopycejsyfwafgexbeia.supabase.co/functions/v1/knowledge-chat" `
  -H "Origin: https://zulthedev.github.io" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: authorization,apikey,content-type"
```

Expected: **HTTP 204** and the response header `Access-Control-Allow-Origin: https://zulthedev.github.io`.

If 401/403/503 appears without that header, ensure the new function was deployed to the correct Supabase project and review its Edge Function logs. The deployment on GitHub Pages does **not** automatically deploy Supabase Edge Functions.

After a successful OPTIONS response, test an actual chatbot request. A later provider error or "no approved documents" notice is separate from the CORS issue.
