import type { CommitInfo } from "../types/agent";

interface CommitHistoryProps {
  commits: CommitInfo[];
}

export function CommitHistory({ commits }: CommitHistoryProps) {
  if (commits.length === 0) {
    return (
      <div className="p-4 text-xs italic" style={{ color: 'var(--text-dim)' }}>
        No commits yet
      </div>
    );
  }

  return (
    <div className="overflow-auto">
      {commits.map((commit) => (
        <div
          key={commit.hash}
          className="px-3 py-2 transition-colors"
          style={{ borderBottom: '1px solid var(--border-default)' }}
          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'}
          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
        >
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs px-2 py-0.5"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-default)',
                color: 'var(--accent-cyan)',
              }}
            >
              {commit.short_hash}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {formatDate(commit.date)}
            </span>
          </div>
          <p className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
            {commit.message}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
            {commit.author}
          </p>
        </div>
      ))}
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  } catch {
    return dateStr;
  }
}
