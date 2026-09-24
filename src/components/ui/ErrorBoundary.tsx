import { AlertOctagon } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Catches render errors so one broken view never blanks the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('View crashed:', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="card flex flex-col items-center gap-3 p-10 text-center">
        <AlertOctagon className="size-8 text-danger" aria-hidden />
        <div>
          <p className="font-semibold">Something went wrong on this page</p>
          <p className="mt-1 text-sm text-muted">{this.state.error.message}</p>
        </div>
        <button className="btn btn-outline" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
