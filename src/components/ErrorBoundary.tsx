import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="h-full flex flex-col items-center justify-center p-6"
          style={{ backgroundColor: "var(--bg-primary)" }}
        >
          <div
            className="max-w-lg p-6"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--accent-red)",
              borderRadius: "var(--border-radius)",
            }}
          >
            <h2
              className="text-sm font-medium mb-2"
              style={{ color: "var(--accent-red)" }}
            >
              Something went wrong
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-secondary)" }}>
              An error occurred while rendering this view.
            </p>
            {this.state.error && (
              <pre
                className="text-xs p-3 overflow-auto mb-4"
                style={{
                  backgroundColor: "var(--bg-primary)",
                  color: "var(--text-dim)",
                  borderRadius: "var(--border-radius)",
                  maxHeight: "200px",
                }}
              >
                {this.state.error.message}
                {this.state.errorInfo?.componentStack && (
                  <>
                    {"\n\nComponent Stack:"}
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </pre>
            )}
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null, errorInfo: null });
              }}
              className="text-xs px-3 py-1.5 transition-colors"
              style={{
                backgroundColor: "transparent",
                border: "1px solid var(--border-active)",
                color: "var(--text-secondary)",
                borderRadius: "var(--border-radius)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--accent-cyan)";
                e.currentTarget.style.color = "var(--accent-cyan)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-active)";
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
