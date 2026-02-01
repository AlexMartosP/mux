import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Name shown in error message for context */
  name?: string;
  /** Callback when error occurs */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Whether to show a minimal inline error vs full error panel */
  inline?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error boundary component that catches React errors and displays a fallback UI.
 * Use inline={true} for smaller sections, full mode for major sections like ChatView.
 */
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
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const name = this.props.name || "this section";

      // Inline error for smaller components
      if (this.props.inline) {
        return (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded text-xs">
            <AlertTriangle size={14} className="text-destructive flex-shrink-0" />
            <span className="text-destructive flex-1">
              Error loading {name}
            </span>
            <button
              onClick={this.handleRetry}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Try again"
            >
              <RefreshCw size={12} />
            </button>
          </div>
        );
      }

      // Full error panel for major sections
      return (
        <div className="h-full flex flex-col items-center justify-center p-6 bg-background">
          <div className="max-w-lg p-6 bg-card border border-destructive rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} className="text-destructive" />
              <h2 className="text-sm font-medium text-destructive">
                Something went wrong
              </h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              An error occurred while rendering {name}.
            </p>
            {this.state.error && (
              <pre className="text-xs p-3 overflow-auto mb-4 bg-background text-muted-foreground rounded max-h-48">
                {this.state.error.message}
                {this.state.errorInfo?.componentStack && (
                  <>
                    {"\n\nComponent Stack:"}
                    {this.state.errorInfo.componentStack}
                  </>
                )}
              </pre>
            )}
            <Button variant="outline" size="sm" onClick={this.handleRetry}>
              <RefreshCw size={14} className="mr-2" />
              Try Again
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component wrapper for functional components.
 * Use when you want to add error boundary to a component without JSX.
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<Props, "children"> = {}
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...options}>
      <Component {...props} />
    </ErrorBoundary>
  );
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name || "Component"})`;
  return WrappedComponent;
}
