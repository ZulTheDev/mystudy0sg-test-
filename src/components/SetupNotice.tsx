// Missing configuration is a setup problem, not a reason to show a blank page.
export function SetupNotice() {
  return (
    <main className="setup-page">
      <section className="setup-card" role="alert">
        <a className="brand" href="./" aria-label="Study0SG home">
          <span className="brand-icon" aria-hidden="true">S<span>0</span></span>
          <span className="brand-name">Study0SG</span>
        </a>
        <span className="eyebrow">ORGANIZERS' PORTAL</span>
        <h1>We're setting up secure sign-in.</h1>
        <p>The portal is online, but Stytch, the official Study0SG organization ID, or Supabase public configuration is missing from this build.</p>
        {import.meta.env.DEV && (
          <div className="setup-instructions">
            <p><strong>For the developer:</strong> create <code>.env.local</code> with:</p>
            <pre>{`VITE_STYTCH_PUBLIC_TOKEN=public-token-test-YOUR_TOKEN\nVITE_STYTCH_ORGANIZATION_ID=organization-test-YOUR_ORG_ID\nVITE_SUPABASE_URL=https://YOUR_REF.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY`}</pre>
            <p>Use the <em>public</em> token from Stytch B2B. Restart <code>npm run dev</code> after saving. Never put your Stytch secret into a VITE variable.</p>
          </div>
        )}
        <p className="muted-note">If you are an organizer, contact Study0SG Tech &amp; Security.</p>
      </section>
    </main>
  );
}
