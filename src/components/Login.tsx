import {
  AuthFlowType,
  B2BProducts,
  StytchB2B,
  StytchEventType,
  useStytchMemberSession,
} from '@stytch/react/b2b';
import { Navigate, useNavigate } from 'react-router';
import { Study0SGLogo } from './Study0SGLogo';

// Stytch's hosted UI handles email magic links and session management.
export function Login() {
  const navigate = useNavigate();
  const { session, isInitialized } = useStytchMemberSession();

  if (!isInitialized) {
    return <p className="auth-status" role="status">Loading secure sign-in…</p>;
  }
  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="page-wrap">
      <div className="portal-grid">
        <section className="intro-panel" aria-label="About the organizer portal">
          <a className="brand" href="#/" aria-label="Study0SG home">
            <Study0SGLogo/>
            <span className="brand-name">Study0SG</span>
          </a>
          <span className="eyebrow">MY STUDY0SG · ORGANIZERS' PORTAL</span>
          <h1>Small teams.<br /><span>Big impact.</span></h1>
          <p>One secure space for Study0SG volunteers to collaborate, support learners and keep track of their contributions.</p>
          <div className="pill-list" aria-label="Available portal features">
            <span>Department workspace</span>
            <span>Volunteer service records</span>
            <span>Learning resources</span>
          </div>
          <p className="intro-footnote">We never fail to try again. ♡</p>
        </section>
        <section className="login-panel" aria-labelledby="login-title">
          <div className="login-head">
            <span className="lock-badge" aria-hidden="true">✦</span>
            <p className="eyebrow">SECURE ORGANIZER ACCESS</p>
            <h2 id="login-title">Welcome back!</h2>
            <p>Sign in using the email linked to your approved Study0SG organizer account.</p>
          </div>
          <div className="stytch-container">
            <StytchB2B
              config={{
                authFlowType: AuthFlowType.Discovery,
                products: [B2BProducts.emailMagicLinks],
                sessionOptions: { sessionDurationMinutes: 60 },
              }}
              callbacks={{
                onEvent: (event) => {
                  if (event.type === StytchEventType.AuthenticateFlowComplete) {
                    navigate('/dashboard', { replace: true });
                  }
                },
              }}
            />
          </div>
          <p className="login-disclaimer">Only invited members of the official Study0SG organization can open the portal. If multiple organizations appear, select Study0SG. Organization creation must be disabled in Stytch SDK settings.</p>
        </section>
      </div>
      <footer className="site-footer">© 2026 Study0SG · Built for our volunteers</footer>
    </main>
  );
}
