import { useMemo, useState, useEffect } from "react";
import { detectLanguage, highlightLine } from "../lib/syntaxHighlight";
import { useReview } from "../contexts/ReviewContext";
import { CommentInput, CommentBubble } from "./CommentInput";
import "../styles/syntax-highlight.css";

interface DiffViewerProps {
  diff: string;
  fileName?: string;
  onLoadMoreContext?: () => void;
  loadingContext?: boolean;
  enableComments?: boolean;
}

interface DiffLine {
  type: "header" | "addition" | "deletion" | "context" | "hunk";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

interface DiffHunk {
  header: DiffLine;
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

interface ParsedDiff {
  headers: DiffLine[];
  hunks: DiffHunk[];
}

function parseDiff(diff: string): ParsedDiff {
  const lines = diff.split("\n");
  const headers: DiffLine[] = [];
  const hunks: DiffHunk[] = [];
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    if (line.startsWith("diff --git") || line.startsWith("index ") ||
        line.startsWith("---") || line.startsWith("+++") ||
        line.startsWith("new file") || line.startsWith("deleted file")) {
      headers.push({ type: "header", content: line });
    } else if (line.startsWith("@@")) {
      // Save previous hunk
      if (currentHunk) {
        hunks.push(currentHunk);
      }

      const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
      if (match) {
        oldLine = parseInt(match[1], 10);
        newLine = parseInt(match[2], 10);
      }

      currentHunk = {
        header: { type: "hunk", content: line },
        lines: [],
        additions: 0,
        deletions: 0,
      };
    } else if (currentHunk) {
      if (line.startsWith("+")) {
        currentHunk.lines.push({
          type: "addition",
          content: line.slice(1),
          newLineNum: newLine++
        });
        currentHunk.additions++;
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({
          type: "deletion",
          content: line.slice(1),
          oldLineNum: oldLine++
        });
        currentHunk.deletions++;
      } else if (line.startsWith(" ") || line === "") {
        currentHunk.lines.push({
          type: "context",
          content: line.slice(1) || "",
          oldLineNum: oldLine++,
          newLineNum: newLine++
        });
      }
    }
  }

  // Don't forget the last hunk
  if (currentHunk) {
    hunks.push(currentHunk);
  }

  return { headers, hunks };
}

// Map diff line type to review line type
function getLineType(type: DiffLine["type"]): "old" | "new" | "context" {
  switch (type) {
    case "deletion":
      return "old";
    case "addition":
      return "new";
    default:
      return "context";
  }
}

export function DiffViewer({
  diff,
  fileName,
  onLoadMoreContext,
  loadingContext,
  enableComments = false,
}: DiffViewerProps) {
  const parsedDiff = useMemo(() => parseDiff(diff), [diff]);
  const language = useMemo(() => detectLanguage(fileName || ""), [fileName]);
  const [collapsedHunks, setCollapsedHunks] = useState<Set<number>>(new Set());
  const [hoveredLine, setHoveredLine] = useState<string | null>(null);
  const [commentingLine, setCommentingLine] = useState<{
    lineNumber: number;
    lineType: "old" | "new" | "context";
  } | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [compactMode, setCompactMode] = useState(false);

  const review = useReview();

  // Detect small container width
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCompactMode(entry.contentRect.width < 500);
      }
    });
    const el = document.getElementById("diff-viewer-root");
    if (el) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggleHunk = (index: number) => {
    setCollapsedHunks(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleAddComment = (lineNumber: number, lineType: "old" | "new" | "context") => {
    setCommentingLine({ lineNumber, lineType });
  };

  const handleSubmitComment = (content: string) => {
    if (!commentingLine || !fileName) return;
    review.addComment({
      filePath: fileName,
      lineNumber: commentingLine.lineNumber,
      lineType: commentingLine.lineType,
      content,
    });
    setCommentingLine(null);
  };

  const handleCancelComment = () => {
    setCommentingLine(null);
    setEditingCommentId(null);
  };

  if (!diff || diff.trim() === "") {
    return (
      <div className="p-4 text-xs italic" style={{ color: 'var(--text-dim)' }}>
        No changes
      </div>
    );
  }

  return (
    <div id="diff-viewer-root" className="text-xs overflow-auto">
      {fileName && (
        <div
          className="px-4 py-2 font-medium sticky top-0 z-10"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderBottom: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
        >
          {fileName}
        </div>
      )}
      <div className="overflow-x-auto">
        {/* File headers */}
        {parsedDiff.headers.map((line, index) => (
          <div
            key={`header-${index}`}
            className="flex"
            style={getLineStyle(line.type)}
          >
            <div
              className={`flex-shrink-0 ${compactMode ? 'w-10' : 'w-20'} flex select-none`}
              style={{
                color: 'var(--text-dim)',
                borderRight: '1px solid var(--border-default)',
              }}
            />
            <span className="flex-shrink-0 w-5 text-center select-none" />
            <pre className="flex-1 px-2 whitespace-pre overflow-x-auto">
              {line.content}
            </pre>
          </div>
        ))}

        {/* Hunks */}
        {parsedDiff.hunks.map((hunk, hunkIndex) => {
          const isCollapsed = collapsedHunks.has(hunkIndex);

          return (
            <div key={`hunk-${hunkIndex}`}>
              {/* Hunk header - clickable to collapse/expand */}
              <div
                className="flex cursor-pointer select-none"
                style={{
                  ...getLineStyle("hunk"),
                  borderTop: '1px solid var(--border-default)',
                }}
                onClick={() => toggleHunk(hunkIndex)}
              >
                <div
                  className="flex-shrink-0 w-20 flex items-center justify-center"
                  style={{
                    color: 'var(--text-dim)',
                    borderRight: '1px solid var(--border-default)',
                  }}
                >
                  <span
                    className="transition-transform duration-200"
                    style={{
                      transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                      color: 'var(--accent-cyan)',
                    }}
                  >
                    ▼
                  </span>
                </div>
                <span className="flex-shrink-0 w-5 text-center" />
                <pre className="flex-1 px-2 whitespace-pre overflow-x-auto flex items-center gap-2">
                  <span>{hunk.header.content}</span>
                  {isCollapsed && (
                    <span
                      className="text-xs px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {hunk.lines.length} lines hidden
                      {hunk.additions > 0 && (
                        <span style={{ color: 'var(--accent-green)', marginLeft: '4px' }}>
                          +{hunk.additions}
                        </span>
                      )}
                      {hunk.deletions > 0 && (
                        <span style={{ color: 'var(--accent-red)', marginLeft: '4px' }}>
                          -{hunk.deletions}
                        </span>
                      )}
                    </span>
                  )}
                </pre>
              </div>

              {/* Hunk lines - with collapse animation */}
              <div
                className="overflow-hidden transition-all duration-200"
                style={{
                  maxHeight: isCollapsed ? 0 : 'none',
                  opacity: isCollapsed ? 0 : 1,
                }}
              >
                {hunk.lines.map((line, lineIndex) => {
                  const shouldHighlight = line.type === "addition" || line.type === "deletion" || line.type === "context";
                  const highlightedContent = shouldHighlight
                    ? highlightLine(line.content, language)
                    : line.content;
                  const lineClass = line.type === "addition"
                    ? "diff-line-addition"
                    : line.type === "deletion"
                      ? "diff-line-deletion"
                      : "";

                  const lineNumber = line.type === "deletion"
                    ? line.oldLineNum
                    : line.newLineNum;
                  const lineType = getLineType(line.type);
                  const lineKey = `${hunkIndex}-${lineIndex}-${lineType}-${lineNumber}`;
                  const isHovered = hoveredLine === lineKey;
                  const isCommenting = commentingLine?.lineNumber === lineNumber &&
                    commentingLine?.lineType === lineType;

                  // Get comments for this line
                  const lineComments = fileName && enableComments
                    ? review.getCommentsForLine(fileName, lineNumber || 0, lineType)
                    : [];

                  return (
                    <div key={`line-${lineIndex}`}>
                      <div
                        className={`flex ${lineClass} group relative`}
                        style={getLineStyle(line.type)}
                        onMouseEnter={() => enableComments && setHoveredLine(lineKey)}
                        onMouseLeave={() => enableComments && setHoveredLine(null)}
                      >
                        <div
                          className={`flex-shrink-0 ${compactMode ? 'w-10' : 'w-20'} flex select-none relative`}
                          style={{
                            color: 'var(--text-dim)',
                            borderRight: '1px solid var(--border-default)',
                          }}
                        >
                          {/* Add comment button */}
                          {enableComments && isHovered && lineNumber && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAddComment(lineNumber, lineType);
                              }}
                              className="absolute left-0 top-0 bottom-0 w-4 flex items-center justify-center transition-colors"
                              style={{
                                color: 'var(--accent-cyan)',
                                backgroundColor: 'var(--bg-elevated)',
                              }}
                              title="Add comment"
                            >
                              +
                            </button>
                          )}
                          {/* Comment indicator */}
                          {lineComments.length > 0 && !isHovered && (
                            <span
                              className="absolute left-0 top-0 bottom-0 w-4 flex items-center justify-center"
                              style={{ color: 'var(--accent-cyan)' }}
                              title={`${lineComments.length} comment(s)`}
                            >
                              ●
                            </span>
                          )}
                          {compactMode ? (
                            <span className="w-10 text-right px-1">
                              {line.type === "deletion" ? line.oldLineNum : line.newLineNum ?? ""}
                            </span>
                          ) : (
                            <>
                              <span className="w-10 text-right px-1">
                                {line.oldLineNum ?? ""}
                              </span>
                              <span className="w-10 text-right px-1">
                                {line.newLineNum ?? ""}
                              </span>
                            </>
                          )}
                        </div>
                        <span className="flex-shrink-0 w-5 text-center select-none">
                          {getLinePrefix(line.type)}
                        </span>
                        {shouldHighlight ? (
                          <pre
                            className="flex-1 px-2 whitespace-pre overflow-x-auto"
                            dangerouslySetInnerHTML={{ __html: highlightedContent }}
                          />
                        ) : (
                          <pre className="flex-1 px-2 whitespace-pre overflow-x-auto">
                            {line.content}
                          </pre>
                        )}
                      </div>

                      {/* Inline comments */}
                      {lineComments.length > 0 && (
                        <div
                          className={`${compactMode ? 'ml-10' : 'ml-20'} mr-2`}
                          style={{ backgroundColor: 'var(--bg-primary)' }}
                        >
                          {lineComments.map((comment) => (
                            editingCommentId === comment.id ? (
                              <div key={comment.id} className="py-1">
                                <CommentInput
                                  onSubmit={(content) => {
                                    review.updateComment(comment.id, content);
                                    setEditingCommentId(null);
                                  }}
                                  onCancel={() => setEditingCommentId(null)}
                                  initialValue={comment.content}
                                  lineNumber={comment.lineNumber}
                                  lineType={comment.lineType}
                                />
                              </div>
                            ) : (
                              <CommentBubble
                                key={comment.id}
                                content={comment.content}
                                onEdit={() => setEditingCommentId(comment.id)}
                                onDelete={() => review.removeComment(comment.id)}
                              />
                            )
                          ))}
                        </div>
                      )}

                      {/* Comment input */}
                      {isCommenting && (
                        <div className={`${compactMode ? 'ml-10' : 'ml-20'} mr-2 py-1`}>
                          <CommentInput
                            onSubmit={handleSubmitComment}
                            onCancel={handleCancelComment}
                            lineNumber={lineNumber || 0}
                            lineType={lineType}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Show more context button */}
        {onLoadMoreContext && parsedDiff.hunks.length > 0 && (
          <div
            className="flex justify-center py-2"
            style={{
              borderTop: '1px solid var(--border-default)',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            <button
              onClick={onLoadMoreContext}
              disabled={loadingContext}
              className="text-xs px-3 py-1 rounded transition-colors"
              style={{
                color: loadingContext ? 'var(--text-dim)' : 'var(--accent-cyan)',
                border: `1px solid ${loadingContext ? 'var(--border-default)' : 'var(--accent-cyan)'}`,
                cursor: loadingContext ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => {
                if (!loadingContext) {
                  e.currentTarget.style.backgroundColor = 'var(--accent-cyan)';
                  e.currentTarget.style.color = 'var(--bg-primary)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = loadingContext ? 'var(--text-dim)' : 'var(--accent-cyan)';
              }}
            >
              {loadingContext ? 'Loading...' : '↕ Show more context'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function getLineStyle(type: DiffLine["type"]): React.CSSProperties {
  switch (type) {
    case "addition":
      return {
        backgroundColor: 'rgba(0, 255, 0, 0.1)',
        color: 'var(--accent-green)',
      };
    case "deletion":
      return {
        backgroundColor: 'rgba(255, 68, 68, 0.1)',
        color: 'var(--accent-red)',
      };
    case "hunk":
      return {
        backgroundColor: 'rgba(0, 255, 255, 0.05)',
        color: 'var(--accent-cyan)',
      };
    case "header":
      return {
        backgroundColor: 'var(--bg-surface)',
        color: 'var(--text-dim)',
      };
    default:
      return {
        color: 'var(--text-secondary)',
      };
  }
}

function getLinePrefix(type: DiffLine["type"]): string {
  switch (type) {
    case "addition":
      return "+";
    case "deletion":
      return "-";
    default:
      return "";
  }
}
