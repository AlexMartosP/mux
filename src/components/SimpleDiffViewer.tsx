import React, { useState, useCallback, useMemo } from "react";
import { ChevronUp, ChevronDown, MessageSquare, Plus } from "lucide-react";
import { refractor } from "refractor";
import "../styles/syntax-highlight.css";
import { CommentInput, type ReviewComment } from "./ReviewComment";

// Convert refractor AST to React elements - moved up for use in cache
function renderTokens(nodes: any[]): React.ReactNode {
  return nodes.map((node, i) => {
    if (node.type === "text") {
      return node.value;
    }
    if (node.type === "element") {
      const className = node.properties?.className?.join(" ") || "";
      return (
        <span key={i} className={className}>
          {renderTokens(node.children || [])}
        </span>
      );
    }
    return null;
  });
}

// Cache for highlighted code to avoid re-highlighting on hover/comment changes
const highlightCache = new Map<string, React.ReactNode>();
const MAX_CACHE_SIZE = 500;

function getCachedHighlight(code: string, language: string | undefined): React.ReactNode {
  if (!language || !code) return code || " ";

  const cacheKey = `${language}:${code}`;
  const cached = highlightCache.get(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const tokens = refractor.highlight(code, language);
    const rendered = renderTokens(tokens.children);

    // Limit cache size
    if (highlightCache.size >= MAX_CACHE_SIZE) {
      const firstKey = highlightCache.keys().next().value;
      if (firstKey) highlightCache.delete(firstKey);
    }

    highlightCache.set(cacheKey, rendered);
    return rendered;
  } catch {
    highlightCache.set(cacheKey, code);
    return code;
  }
}

// File extension to language mapping
const extensionToLanguage: Record<string, string> = {
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".html": "markup",
  ".htm": "markup",
  ".css": "css",
  ".scss": "scss",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".rs": "rust",
  ".go": "go",
  ".py": "python",
  ".rb": "ruby",
  ".sh": "shell",
  ".bash": "shell",
  ".md": "markdown",
  ".sql": "sql",
};

function detectLanguage(filePath: string): string | undefined {
  if (!filePath) return undefined;
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  const lang = extensionToLanguage[ext];
  if (lang && refractor.registered(lang)) {
    return lang;
  }
  return undefined;
}

interface DiffLine {
  type: "add" | "delete" | "context" | "hunk-header";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

interface SimpleDiffViewerProps {
  diff: string;
  fileName?: string;
  onExpandContext?: () => void;
  loadingContext?: boolean;
  // Comment support - uses row index for tracking active comment
  comments?: ReviewComment[];
  onAddComment?: (lineNumber: number, content: string, sendImmediately: boolean) => void;
  activeCommentLine?: number | null;
  onSetActiveCommentLine?: (lineNumber: number | null) => void;
}

function parseDiffLines(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  const rawLines = diff.split("\n");

  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of rawLines) {
    // Skip file headers
    if (line.startsWith("diff --git") || line.startsWith("index ") ||
        line.startsWith("---") || line.startsWith("+++") ||
        line.startsWith("Binary files")) {
      continue;
    }

    // Hunk header: @@ -start,count +start,count @@
    if (line.startsWith("@@")) {
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[2], 10);
      }
      lines.push({ type: "hunk-header", content: line });
      continue;
    }

    // Addition
    if (line.startsWith("+")) {
      lines.push({
        type: "add",
        content: line.slice(1),
        newLineNum: newLineNum++,
      });
      continue;
    }

    // Deletion
    if (line.startsWith("-")) {
      lines.push({
        type: "delete",
        content: line.slice(1),
        oldLineNum: oldLineNum++,
      });
      continue;
    }

    // Context line (starts with space or is empty after the prefix area)
    if (line.startsWith(" ") || line === "") {
      lines.push({
        type: "context",
        content: line.slice(1) || "",
        oldLineNum: oldLineNum++,
        newLineNum: newLineNum++,
      });
    }
  }

  return lines;
}


export function SimpleDiffViewer({
  diff,
  fileName,
  onExpandContext,
  loadingContext,
  comments = [],
  onAddComment,
  activeCommentLine,
  onSetActiveCommentLine,
}: SimpleDiffViewerProps) {
  // Track which row index has active comment input
  const [activeCommentRowIdx, setActiveCommentRowIdx] = useState<number | null>(null);

  const lines = useMemo(() => parseDiffLines(diff), [diff]);
  const language = useMemo(() => detectLanguage(fileName || ""), [fileName]);

  const getCommentsForLine = useCallback(
    (lineNumber: number) => comments.filter((c) => c.lineNumber === lineNumber),
    [comments]
  );

  const handleRowClick = useCallback(
    (rowIdx: number, lineNum: number) => {
      if (!onSetActiveCommentLine) return;

      // Toggle: if clicking the same row, close; otherwise open
      if (activeCommentRowIdx === rowIdx) {
        setActiveCommentRowIdx(null);
        onSetActiveCommentLine(null);
      } else {
        setActiveCommentRowIdx(rowIdx);
        onSetActiveCommentLine(lineNum);
      }
    },
    [activeCommentRowIdx, onSetActiveCommentLine]
  );

  const handleCommentSubmit = useCallback(
    (content: string, sendImmediately: boolean) => {
      if (activeCommentLine && onAddComment) {
        onAddComment(activeCommentLine, content, sendImmediately);
        setActiveCommentRowIdx(null);
        onSetActiveCommentLine?.(null);
      }
    },
    [activeCommentLine, onAddComment, onSetActiveCommentLine]
  );

  const handleCancelComment = useCallback(() => {
    setActiveCommentRowIdx(null);
    onSetActiveCommentLine?.(null);
  }, [onSetActiveCommentLine]);

  if (!diff || diff.trim() === "") {
    return (
      <div className="p-4 text-xs" style={{ color: "var(--text-dim)" }}>
        No changes
      </div>
    );
  }

  // Check if first hunk doesn't start at line 1
  const firstHunk = lines.find((l) => l.type === "hunk-header");
  const showExpandUp = onExpandContext && firstHunk && lines[0]?.type === "hunk-header";

  return (
    <div className="diff-viewer font-mono text-xs">
      {/* Expand up */}
      {showExpandUp && (
        <ExpandControl direction="up" onClick={onExpandContext} disabled={loadingContext} />
      )}

      {/* Diff lines */}
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, idx) => {
            if (line.type === "hunk-header") {
              return (
                <tr key={idx} style={{ backgroundColor: "rgba(6, 182, 212, 0.05)" }}>
                  <td
                    colSpan={3}
                    className="px-3 py-1 text-xs italic"
                    style={{ color: "var(--accent-cyan)" }}
                  >
                    {line.content}
                  </td>
                </tr>
              );
            }

            // Use newLineNum for additions/context, oldLineNum for deletions
            const lineNum = line.newLineNum ?? line.oldLineNum;
            const displayLineNum = line.type === "delete" ? line.oldLineNum : line.newLineNum;
            const lineComments = lineNum ? getCommentsForLine(lineNum) : [];
            const isActiveCommentRow = activeCommentRowIdx === idx;
            const canComment = onAddComment && lineNum;

            // Determine background color based on line type
            let bgColor = "transparent";
            let gutterBg = "var(--bg-surface)";
            let lineNumColor = "var(--text-dim)";

            if (line.type === "add") {
              bgColor = "rgba(74, 222, 128, 0.1)";
              gutterBg = "rgba(74, 222, 128, 0.15)";
              lineNumColor = "var(--accent-green)";
            } else if (line.type === "delete") {
              bgColor = "rgba(248, 113, 113, 0.1)";
              gutterBg = "rgba(248, 113, 113, 0.15)";
              lineNumColor = "var(--accent-red)";
            }

            return (
              <React.Fragment key={idx}>
                <tr
                  className="diff-row"
                  style={{ backgroundColor: bgColor }}
                >
                  {/* Line number gutter */}
                  <td
                    className={`select-none text-right px-2 align-top diff-gutter${canComment ? ' diff-gutter-clickable' : ''}`}
                    style={{
                      backgroundColor: gutterBg,
                      color: lineNumColor,
                      width: "50px",
                      borderRight: "1px solid var(--border-default)",
                    }}
                    onClick={() => lineNum && canComment && handleRowClick(idx, lineNum)}
                  >
                    {displayLineNum}
                    {/* Plus icon - shown on hover via CSS */}
                    {canComment && (
                      <Plus
                        size={12}
                        strokeWidth={2}
                        className="diff-add-comment-icon"
                      />
                    )}
                  </td>

                  {/* Code content with syntax highlighting */}
                  <td
                    className="px-3 whitespace-pre-wrap break-all"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {getCachedHighlight(line.content, language)}
                  </td>
                </tr>

                {/* Comments and comment input - only show for this specific row */}
                {(lineComments.length > 0 || isActiveCommentRow) && (
                  <tr>
                    <td colSpan={2} style={{ backgroundColor: "var(--bg-surface)" }}>
                      <div className="px-2 py-1">
                        {/* Existing comments */}
                        {lineComments.map((comment) => (
                          <div
                            key={comment.id}
                            className="flex items-start gap-2 px-2 py-1 mb-1 text-xs"
                            style={{
                              backgroundColor: "var(--bg-accent-subtle)",
                              borderLeft: "2px solid var(--accent-cyan)",
                              borderRadius: "var(--border-radius)",
                            }}
                          >
                            <MessageSquare
                              size={12}
                              strokeWidth={1.5}
                              style={{ color: "var(--accent-cyan)", flexShrink: 0, marginTop: 2 }}
                            />
                            <span style={{ color: "var(--text-secondary)" }}>{comment.content}</span>
                          </div>
                        ))}
                        {/* Comment input */}
                        {isActiveCommentRow && lineNum && (
                          <CommentInput
                            filePath={fileName || ""}
                            lineNumber={lineNum}
                            onSubmit={handleCommentSubmit}
                            onCancel={handleCancelComment}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>

      {/* Expand down */}
      {onExpandContext && (
        <ExpandControl direction="down" onClick={onExpandContext} disabled={loadingContext} />
      )}
    </div>
  );
}

// Expand control component
function ExpandControl({
  direction,
  onClick,
  disabled,
}: {
  direction: "up" | "down";
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-center py-1 cursor-pointer transition-colors group"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderTop: "1px solid var(--border-default)",
        borderBottom: "1px solid var(--border-default)",
      }}
      onClick={disabled ? undefined : onClick}
    >
      <div
        className="flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors"
        style={{
          color: disabled ? "var(--text-dim)" : "var(--text-secondary)",
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        {direction === "up" ? (
          <ChevronUp size={14} strokeWidth={1.5} />
        ) : (
          <ChevronDown size={14} strokeWidth={1.5} />
        )}
        <span className="group-hover:text-[var(--accent-cyan)]">
          {disabled ? "Loading..." : "Expand"}
        </span>
        {direction === "down" ? (
          <ChevronDown size={14} strokeWidth={1.5} />
        ) : (
          <ChevronUp size={14} strokeWidth={1.5} />
        )}
      </div>
    </div>
  );
}
