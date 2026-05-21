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
        <div className="bg-[#111118] border border-red-500/30 rounded-xl p-6 text-white">
          <h2 className="text-xl font-bold">Something went wrong</h2>
          <p className="mt-2 text-sm text-red-300">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium"
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
