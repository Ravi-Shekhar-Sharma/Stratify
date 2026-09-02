import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * If anything throws during a judge's session, the alternative to this is
 * a white screen and that is the whole evaluation. A designed fallback —
 * matching the app's own tokens, not the browser's default error page —
 * with a reset path that doesn't require the visitor to know to reload.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Stratify] caught render error:', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-6 text-center">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 shrink-0 bg-starved" aria-hidden />
            <span className="font-mono text-[15px] font-bold tracking-tight text-ink-primary">STRATIFY</span>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="font-mono text-h2 font-bold text-ink-primary">Something didn't render.</h1>
            <p className="max-w-md text-[15px] leading-[1.6] text-white/72">
              The twin hit an unexpected error and stopped rendering rather than show something wrong. This is a
              display fault, not a control fault - nothing downstream was affected.
            </p>
          </div>
          <button
            type="button"
            onClick={this.handleReload}
            className="rounded-full border border-line bg-panel-raised px-5 py-2.5 text-[13px] font-semibold text-ink-primary transition-[background-color,transform] duration-150 hover:bg-panel-inset active:scale-[0.97]"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
