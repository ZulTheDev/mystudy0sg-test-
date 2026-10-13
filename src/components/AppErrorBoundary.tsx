import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { failed: boolean };

// Prevent an unexpected React render error from becoming a white screen.
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('Portal render error:', error, info);
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="setup-page">
        <section className="setup-card" role="alert">
          <span className="eyebrow">STUDY0SG · TECH &amp; SECURITY</span>
          <h1>We couldn't open the portal.</h1>
          <p>An unexpected frontend error occurred. You can try reloading. If the problem continues, contact the Tech &amp; Security team.</p>
          <button className="retry-button" type="button" onClick={() => window.location.reload()}>Reload the page</button>
        </section>
      </main>
    );
  }
}
