interface AppError {
  message: string;
  category: string;
  recoverable: boolean;
  suggestions: string[];
}

interface ErrorDisplayProps {
  error: AppError | string;
  onRetry?: () => void;
  onDismiss?: () => void;
}

const categoryConfig: Record<string, { icon: string; label: string; color: string }> = {
  database: { icon: "DB", label: "Database Error", color: "var(--accent-red)" },
  io: { icon: "IO", label: "File System Error", color: "var(--accent-red)" },
  json: { icon: "JS", label: "Parse Error", color: "var(--accent-red)" },
  not_found: { icon: "?", label: "Not Found", color: "var(--accent-yellow)" },
  git: { icon: "G", label: "Git Error", color: "var(--accent-orange, #f97316)" },
  github: { icon: "GH", label: "GitHub Error", color: "var(--accent-magenta)" },
  process: { icon: "P", label: "Process Error", color: "var(--accent-red)" },
  worktree: { icon: "WT", label: "Worktree Error", color: "var(--accent-orange, #f97316)" },
  other: { icon: "!", label: "Error", color: "var(--accent-red)" },
};

export function ErrorDisplay({ error, onRetry, onDismiss }: ErrorDisplayProps) {
  // Handle both structured errors and plain strings
  const errorObj: AppError = typeof error === "string"
    ? { message: error, category: "other", recoverable: false, suggestions: [] }
    : error;

  const config = categoryConfig[errorObj.category] || categoryConfig.other;

  return (
    <div
      className="p-4"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: `1px solid ${config.color}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        <span
          className="w-8 h-8 flex items-center justify-center text-xs font-bold"
          style={{
            backgroundColor: config.color,
            color: "var(--bg-primary)",
          }}
        >
          {config.icon}
        </span>
        <div className="flex-1">
          <p className="text-xs font-medium" style={{ color: config.color }}>
            {config.label}
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-primary)" }}>
            {errorObj.message}
          </p>
        </div>
      </div>

      {/* Suggestions */}
      {errorObj.suggestions.length > 0 && (
        <div className="mt-3 pl-11">
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            SUGGESTIONS:
          </p>
          <ul className="space-y-1">
            {errorObj.suggestions.map((suggestion, i) => (
              <li key={i} className="text-xs flex items-start gap-2">
                <span style={{ color: "var(--text-dim)" }}>•</span>
                <span style={{ color: "var(--text-dim)" }}>{suggestion}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      {(errorObj.recoverable || onDismiss) && (
        <div className="mt-4 pl-11 flex gap-2">
          {errorObj.recoverable && onRetry && (
            <button
              onClick={onRetry}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: "var(--accent-cyan)",
                color: "var(--bg-primary)",
              }}
            >
              RETRY
            </button>
          )}
          {onDismiss && (
            <button
              onClick={onDismiss}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: "transparent",
                border: "1px solid var(--border-active)",
                color: "var(--text-secondary)",
              }}
            >
              DISMISS
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Compact inline error for forms
interface InlineErrorProps {
  message: string;
}

export function InlineError({ message }: InlineErrorProps) {
  return (
    <div
      className="px-3 py-2 text-xs flex items-center gap-2"
      style={{
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        border: "1px solid var(--accent-red)",
        color: "var(--accent-red)",
      }}
    >
      <span>[!]</span>
      <span>{message}</span>
    </div>
  );
}
