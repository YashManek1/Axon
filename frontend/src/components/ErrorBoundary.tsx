import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("Dashboard render error", error, errorInfo);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="bg-surface border border-danger/30 rounded-md p-6 text-ink">
          <h2 className="text-lg font-bold">Something went wrong</h2>
          <p className="mt-2 text-sm text-danger/75">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-3 py-2 rounded-sm bg-primary hover:bg-primary-hover text-white text-sm font-medium transition-all"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
