import type { ActivityEvent } from "../types/agent";
import type { ActiveAgent } from "../hooks/useAgentActivity";

interface ActivityFeedProps {
  currentActivity: ActivityEvent | null;
  activeAgent: ActiveAgent | null;
  isRunning: boolean;
}

export function ActivityFeed({ currentActivity, activeAgent, isRunning }: ActivityFeedProps) {
  if (!isRunning) return null;

  return (
    <div style={{
      backgroundColor: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border-default)',
    }}>
      <div className="px-4 py-2 flex items-center gap-3">
        <span className="animate-pulse" style={{ color: 'var(--accent-green)' }}>▸</span>
        {activeAgent && currentActivity?.tool_name !== "Task" ? (
          // Show nested: agent context + current sub-action
          <div className="flex items-center gap-2 text-xs min-w-0">
            <span style={{ color: 'var(--accent-yellow)' }}>[T]</span>
            <span className="truncate" style={{ color: 'var(--text-dim)' }}>
              {activeAgent.description}
            </span>
            {currentActivity && (
              <>
                <span style={{ color: 'var(--text-dim)' }}>→</span>
                <ToolIndicator toolName={currentActivity.tool_name} />
                <span className="truncate" style={{ color: 'var(--text-secondary)' }}>
                  {formatActivity(currentActivity)}
                </span>
              </>
            )}
            {!currentActivity && (
              <span style={{ color: 'var(--text-dim)' }}>working...</span>
            )}
          </div>
        ) : currentActivity ? (
          <div className="flex items-center gap-2 text-xs">
            <ToolIndicator toolName={currentActivity.tool_name} />
            <span style={{ color: 'var(--text-secondary)' }}>
              {formatActivity(currentActivity)}
            </span>
          </div>
        ) : (
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Thinking...</span>
        )}
      </div>
    </div>
  );
}

function ToolIndicator({ toolName }: { toolName?: string }) {
  const indicator = getToolIndicatorChar(toolName);
  const color = getToolColor(toolName);

  return (
    <span className="text-xs" style={{ color }}>
      [{indicator}]
    </span>
  );
}

function formatActivity(activity: ActivityEvent): string {
  if (!activity.tool_name) return "Working...";

  const input = activity.tool_input || {};

  switch (activity.tool_name) {
    case "Read": {
      const path = (input.file_path as string) || "file";
      return `Reading ${shortenPath(path)}`;
    }
    case "Write": {
      const path = (input.file_path as string) || "file";
      return `Writing ${shortenPath(path)}`;
    }
    case "Edit": {
      const path = (input.file_path as string) || "file";
      return `Editing ${shortenPath(path)}`;
    }
    case "Bash": {
      const cmd = (input.command as string) || "command";
      return `$ ${cmd.length > 40 ? cmd.slice(0, 37) + "..." : cmd}`;
    }
    case "Glob": {
      const pattern = (input.pattern as string) || "pattern";
      return `Finding: ${pattern}`;
    }
    case "Grep": {
      const pattern = (input.pattern as string) || "pattern";
      return `Searching: ${pattern}`;
    }
    case "Task": {
      const desc = (input.description as string) || "subtask";
      return `Agent: ${desc}`;
    }
    case "WebFetch": {
      const url = (input.url as string) || "url";
      return `Fetching: ${url.length > 40 ? url.slice(0, 37) + "..." : url}`;
    }
    case "WebSearch": {
      const query = (input.query as string) || "query";
      return `Searching: ${query}`;
    }
    default:
      return `Using ${activity.tool_name}`;
  }
}

function shortenPath(path: string): string {
  const parts = path.split("/");
  if (parts.length <= 2) return path;
  return `.../${parts.slice(-2).join("/")}`;
}

function getToolIndicatorChar(toolName?: string): string {
  switch (toolName) {
    case "Read": return "R";
    case "Write": return "W";
    case "Edit": return "E";
    case "Bash": return "$";
    case "Glob":
    case "Grep": return "?";
    case "Task": return "T";
    case "WebFetch":
    case "WebSearch": return "@";
    default: return ">";
  }
}

function getToolColor(toolName?: string): string {
  switch (toolName) {
    case "Read":
      return "var(--accent-cyan)";
    case "Write":
      return "var(--accent-green)";
    case "Edit":
      return "var(--accent-yellow)";
    case "Bash":
      return "var(--accent-cyan)";
    case "Glob":
    case "Grep":
      return "var(--accent-cyan)";
    case "Task":
      return "var(--accent-yellow)";
    case "WebFetch":
    case "WebSearch":
      return "var(--accent-cyan)";
    default:
      return "var(--text-secondary)";
  }
}
