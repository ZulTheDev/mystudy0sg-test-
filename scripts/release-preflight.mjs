/** Build-time environment guard. Never prints credential values. */
const stage = process.argv[2] || process.env.VITE_DEPLOYMENT_STAGE;
const problems = [];
const get = (name) => (process.env[name] || '').trim();
if (!['staging','production'].includes(stage)) problems.push('Choose staging or production');
const p = get('VITE_STYTCH_PUBLIC_TOKEN');
const o = get('VITE_STYTCH_ORGANIZATION_ID');
const u = get('VITE_SUPABASE_URL');
const k = get('VITE_SUPABASE_PUBLISHABLE_KEY');
if (!p.startsWith('public-token-') || /REPLACE|YOUR_TOKEN|PLACEHOLDER/i.test(p)) problems.push('Missing real Stytch public token');
if (!o.startsWith('organization-') || /REPLACE|YOUR_ORG/i.test(o)) problems.push('Missing real Stytch organization ID');
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(u) || /YOUR_/i.test(u)) problems.push('Invalid Supabase URL');
if (!k.startsWith('sb_publishable_') || /REPLACE|YOUR_/i.test(k)) problems.push('Missing real Supabase publishable key');
if (stage === 'production') {
  if (!p.startsWith('public-token-live-')) problems.push('Production Stytch token must be Live');
  if (!o.startsWith('organization-live-')) problems.push('Production Stytch organization must be Live');
  if (u.includes('dopycejsyfwafgexbeia')) problems.push('Refusing to deploy the known test Supabase project as production');
  if (!get('VITE_BASE_PATH')) problems.push('Set the real production Vite base path');
} else if (stage === 'staging') {
  if (!p.startsWith('public-token-test-')) problems.push('Staging must use a Stytch Test token');
  if (!o.startsWith('organization-test-')) problems.push('Staging must use Stytch Test org');
  if (get('VITE_BASE_PATH') !== '/mystudy0sg-test-/') problems.push('Staging Pages base must be /mystudy0sg-test-/');
}
if (problems.length) {
  for (const x of problems) console.error('CONFIG ERROR:',x);
  process.exit(1);
}
console.log(`PASS: ${stage} public environment variables are structurally consistent (does not verify live API connectivity).`);
