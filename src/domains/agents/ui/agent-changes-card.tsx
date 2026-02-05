import { FilePlus, FileEdit, FileX, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileChange } from "@/types/agent";

interface DiffLine {
  type: "add" | "delete" | "context" | "header";
  content: string;
}

function parseDiffLines(diff: string): DiffLine[] {
  const lines = diff.split("\n");
  const result: DiffLine[] = [];

  for (const line of lines) {
    if (line.startsWith("@@")) {
      result.push({ type: "header", content: line });
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      result.push({ type: "add", content: line.slice(1) });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      result.push({ type: "delete", content: line.slice(1) });
    } else if (!line.startsWith("diff ") && !line.startsWith("index ") && !line.startsWith("+++") && !line.startsWith("---")) {
      result.push({ type: "context", content: line });
    }
  }

  return result;
}

interface AgentChangesCardProps {
  file: FileChange;
  diffPreview: string;
  commentCount?: number;
  isSelected?: boolean;
  onClick: () => void;
}

export function AgentChangesCard({
  file,
  diffPreview,
  commentCount = 0,
  isSelected = false,
  onClick,
}: AgentChangesCardProps) {
  const fileName = file.path.split("/").pop() || file.path;
  const isDeleted = file.status === "deleted";

  const getStatusIcon = () => {
    switch (file.status) {
      case "added":
        return <FilePlus size={14} strokeWidth={1.5} className="text-success" />;
      case "deleted":
        return <FileX size={14} strokeWidth={1.5} className="text-destructive" />;
      default:
        return <FileEdit size={14} strokeWidth={1.5} className="text-muted-foreground" />;
    }
  };

  // Parse and display first few diff lines
  const PREVIEW_LINES = 5;
  const diffLines = parseDiffLines(diffPreview)
    .filter((line) => line.type === "add" || line.type === "delete")
    .slice(0, PREVIEW_LINES);

  return (
    <button
      onClick={onClick}
      disabled={isDeleted}
      className={cn(
        "w-full text-left border rounded-md transition-all",
        isSelected
          ? "border-primary bg-muted"
          : "border-border bg-card hover:border-muted-foreground/50",
        isDeleted && "opacity-50 cursor-not-allowed"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {getStatusIcon()}
          <span className="text-sm text-foreground truncate" title={file.path}>
            {fileName}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {file.additions > 0 && (
            <span className="text-xs text-success">+{file.additions}</span>
          )}
          {file.deletions > 0 && (
            <span className="text-xs text-destructive">-{file.deletions}</span>
          )}
        </div>
      </div>

      {/* Diff preview */}
      {diffLines.length > 0 && (
        <div className="px-3 py-2 font-mono text-xs overflow-hidden">
          {diffLines.map((line, i) => (
            <div
              key={i}
              className={cn(
                "truncate py-0.5 px-1 rounded-sm",
                line.type === "add" && "bg-success/10 text-success",
                line.type === "delete" && "bg-destructive/10 text-destructive"
              )}
            >
              <span className="opacity-50 mr-1">{line.type === "add" ? "+" : "-"}</span>
              {line.content.slice(0, 60)}
              {line.content.length > 60 && "..."}
            </div>
          ))}
        </div>
      )}

      {/* Footer with comment count */}
      {commentCount > 0 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-t border-border text-muted-foreground">
          <MessageSquare size={12} strokeWidth={1.5} />
          <span className="text-xs">{commentCount} comments</span>
        </div>
      )}
    </button>
  );
}
