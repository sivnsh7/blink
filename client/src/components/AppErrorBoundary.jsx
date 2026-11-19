import React from 'react';

/**
 * Keeps a component render failure from turning the entire dashboard into a
 * blank page. This boundary intentionally does not hide the error from logs.
 */
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[Blink] Dashboard render failed', error, info);
  }

  retry = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="fatal-error" role="alert">
        <section className="fatal-error__card">
          <span className="stamp stamp--hypothesis">RENDER ERROR</span>
          <h1>Dashboard could not render</h1>
          <p>
            Blink hit an interface error. Retry the render, or reload the page
            to request a clean application start.
          </p>
          {import.meta.env.DEV && (
            <pre className="fatal-error__details">{String(this.state.error?.message || this.state.error)}</pre>
          )}
          <div className="fatal-error__actions">
            <button type="button" className="btn btn--clay" onClick={this.retry}>
              Try again
            </button>
            <button type="button" className="btn btn--paper" onClick={() => window.location.reload()}>
              Reload dashboard
            </button>
          </div>
          <p className="fatal-error__note">This recovery control does not send process signals or change host settings.</p>
        </section>
      </main>
    );
  }
}
