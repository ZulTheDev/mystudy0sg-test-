import React, { useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router';
import {
  createStytchB2BClient,
  StytchB2BProvider,
} from '@stytch/react/b2b';
import { App } from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { SetupNotice } from './components/SetupNotice';
import './styles.css';

// Only the public Stytch token belongs in the frontend.
const publicToken = import.meta.env.VITE_STYTCH_PUBLIC_TOKEN?.trim();
const hasPublicToken = Boolean(
  publicToken && publicToken.startsWith('public-token-') &&
  import.meta.env.VITE_STYTCH_ORGANIZATION_ID &&
  import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

// Create the Stytch client *inside React* so any initialization failure
// is caught by our error boundary instead of causing a white screen.
function ConfiguredPortal({ token }: { token: string }) {
  const stytch = useMemo(() => createStytchB2BClient(token), [token]);
  return (
    <StytchB2BProvider stytch={stytch}>
      <HashRouter>
        <App />
      </HashRouter>
    </StytchB2BProvider>
  );
}

// Render guidance instead of crashing when the token is not configured.
const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      {hasPublicToken ? (
        <ConfiguredPortal token={publicToken!} />
      ) : (
        <SetupNotice />
      )}
    </AppErrorBoundary>
  </React.StrictMode>,
);
