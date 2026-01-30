import { useMemo, useState, useCallback, useEffect } from "react";
import { parseDiff, Diff, Hunk, tokenize, HunkData } from "react-diff-view";
import { refractor } from "refractor";
import { AlignJustify, Columns2, ChevronUp, ChevronDown, MessageSquare } from "lucide-react";
import "react-diff-view/style/index.css";
import "../styles/syntax-highlight.css";
import { CommentInput, type ReviewComment } from "./ReviewComment";

// File extension to language mapping (refractor common bundle languages)
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
  ".sass": "sass",
  ".less": "less",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".xml": "markup",
  ".svg": "markup",
  ".rs": "rust",
  ".go": "go",
  ".c": "c",
  ".h": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hxx": "cpp",
  ".java": "java",
  ".kt": "kotlin",
  ".kts": "kotlin",
  ".scala": "java", // fallback to java
  ".cs": "csharp",
  ".py": "python",
  ".rb": "ruby",
  ".php": "php",
  ".sh": "shell",
  ".bash": "shell",
  ".zsh": "shell",
  ".swift": "swift",
  ".md": "markdown",
  ".markdown": "markdown",
  ".sql": "sql",
  ".toml": "ini", // fallback to ini
  ".ini": "ini",
  ".conf": "shell",
  ".env": "shell",
};

function detectLanguage(filePath: string): string | undefined {
  if (!filePath) return undefined;
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  const lang = extensionToLanguage[ext];

  if (!lang) {
    console.log("[DiffViewer] No language mapping for ext:", ext);
    return undefined;
  }

  // Check if language is registered in refractor
  try {
    const isRegistered = refractor.registered(lang);
    console.log("[DiffViewer] Language", lang, "registered:", isRegistered);
    if (isRegistered) {
      return lang;
    }
  } catch (e) {
    console.log("[DiffViewer] Error checking language registration:", e);
  }
  return undefined;
}

// Type for change object from react-diff-view
interface ChangeInfo {
  key?: string;
  newLineNumber?: number;
  oldLineNumber?: number;
  lineNumber?: number;
}

// Helper to get line number from any change type
function getLineNumber(change: unknown): number | undefined {
  const c = change as ChangeInfo;
  return c.newLineNumber || c.oldLineNumber || c.lineNumber;
}

// Helper to get the unique key from a change
function getChangeKey(change: unknown): string | undefined {
  const c = change as ChangeInfo;
  return c.key;
}

// Build widgets for comments and comment input
function buildWidgets(
  hunks: HunkData[],
  activeChangeKey: string | null | undefined,
  _comments: ReviewComment[], // Used via getCommentsForLine callback
  fileName: string,
  onSubmit: (content: string, sendImmediately: boolean) => void,
  onCancel: () => void,
  getCommentsForLine: (lineNumber: number) => ReviewComment[]
): Record<string, React.ReactElement> {
  const widgets: Record<string, React.ReactElement> = {};

  // Collect all changes from hunks
  for (const hunk of hunks) {
    for (const change of hunk.changes) {
      const changeKey = getChangeKey(change);
      const lineNum = getLineNumber(change);
      if (!changeKey || !lineNum) continue;

      const lineComments = getCommentsForLine(lineNum);
      const isActiveComment = activeChangeKey === changeKey;

      if (lineComments.length > 0 || isActiveComment) {
        widgets[changeKey] = (
          <div className="diff-comment-widget px-2 py-1">
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
                <MessageSquare size={12} strokeWidth={1.5} style={{ color: "var(--accent-cyan)", flexShrink: 0, marginTop: 2 }} />
                <span style={{ color: "var(--text-secondary)" }}>{comment.content}</span>
              </div>
            ))}
            {/* Comment input */}
            {isActiveComment && (
              <CommentInput
                filePath={fileName}
                lineNumber={lineNum}
                onSubmit={onSubmit}
                onCancel={onCancel}
              />
            )}
          </div>
        );
      }
    }
  }

  return widgets;
}

interface DiffViewerProps {
  diff: string;
  fileName?: string;
  onExpandContext?: () => void;
  loadingContext?: boolean;
  isFullScreen?: boolean;
  // Comment support
  comments?: ReviewComment[];
  onAddComment?: (lineNumber: number, content: string, sendImmediately: boolean) => void;
  activeCommentLine?: number | null;
  onSetActiveCommentLine?: (lineNumber: number | null) => void;
}

type ViewType = "unified" | "split";

export function DiffViewer({
  diff,
  fileName,
  onExpandContext,
  loadingContext,
  isFullScreen = false,
  comments = [],
  onAddComment,
  activeCommentLine,
  onSetActiveCommentLine,
}: DiffViewerProps) {
  const [viewType, setViewType] = useState<ViewType>("unified");
  // Track the change key internally for widget matching
  const [activeChangeKey, setActiveChangeKey] = useState<string | null>(null);

  // Handle gutter click for comments - needs both change key and line number
  const handleGutterClick = useCallback((change: unknown) => {
    console.log("[DiffViewer] Gutter clicked, change:", change);
    if (!onSetActiveCommentLine) {
      console.log("[DiffViewer] No onSetActiveCommentLine handler");
      return;
    }

    const changeKey = getChangeKey(change);
    const lineNum = getLineNumber(change);
    console.log("[DiffViewer] changeKey:", changeKey, "lineNum:", lineNum);

    if (!changeKey || !lineNum) {
      console.log("[DiffViewer] Missing changeKey or lineNum");
      return;
    }

    // Toggle: if clicking the same line, close; otherwise open
    if (activeCommentLine === lineNum) {
      console.log("[DiffViewer] Closing comment input");
      onSetActiveCommentLine(null);
      setActiveChangeKey(null);
    } else {
      console.log("[DiffViewer] Opening comment input for line", lineNum);
      onSetActiveCommentLine(lineNum);
      setActiveChangeKey(changeKey);
    }
  }, [activeCommentLine, onSetActiveCommentLine]);

  // Handle comment submission
  const handleCommentSubmit = useCallback((content: string, sendImmediately: boolean) => {
    if (activeCommentLine && onAddComment) {
      onAddComment(activeCommentLine, content, sendImmediately);
      onSetActiveCommentLine?.(null);
      setActiveChangeKey(null);
    }
  }, [activeCommentLine, onAddComment, onSetActiveCommentLine]);

  // Get comments for a specific line
  const getCommentsForLine = useCallback((lineNumber: number) => {
    return comments.filter(c => c.lineNumber === lineNumber);
  }, [comments]);

  // Reset internal change key when external line is cleared (e.g., file switch)
  useEffect(() => {
    if (activeCommentLine === null) {
      setActiveChangeKey(null);
    }
  }, [activeCommentLine]);

  // In compact mode, always use unified view
  const effectiveViewType = isFullScreen ? viewType : "unified";

  const { files, tokens } = useMemo(() => {
    if (!diff || diff.trim() === "") {
      return { files: [], tokens: undefined };
    }

    try {
      const parsed = parseDiff(diff);
      const language = detectLanguage(fileName || "");

      console.log("[DiffViewer] fileName:", fileName, "detected language:", language);

      // Tokenize for syntax highlighting
      let tokenized = undefined;
      if (language && parsed.length > 0 && parsed[0].hunks) {
        const options = {
          highlight: true,
          refractor,
          language,
        };
        try {
          tokenized = tokenize(parsed[0].hunks, options);
          console.log("[DiffViewer] tokenized successfully, keys:", tokenized ? Object.keys(tokenized).length : 0);
        } catch (err) {
          console.warn("[DiffViewer] Failed to tokenize:", err);
        }
      }

      return { files: parsed, tokens: tokenized };
    } catch (err) {
      console.error("[DiffViewer] Failed to parse diff:", err);
      return { files: [], tokens: undefined };
    }
  }, [diff, fileName]);

  if (!diff || diff.trim() === "" || files.length === 0) {
    return (
      <div className="p-4 text-xs" style={{ color: "var(--text-dim)" }}>
        No changes
      </div>
    );
  }

  return (
    <div className="diff-viewer">
      {/* View toggle - only in full screen mode */}
      {isFullScreen && (
        <div
          className="flex items-center justify-end gap-1 px-2 py-1"
          style={{
            borderBottom: "1px solid var(--border-default)",
            backgroundColor: "var(--bg-surface)",
          }}
        >
          <button
            onClick={() => setViewType("unified")}
            className="p-1.5 rounded transition-colors"
            style={{
              backgroundColor: viewType === "unified" ? "var(--bg-elevated)" : "transparent",
              color: viewType === "unified" ? "var(--accent-cyan)" : "var(--text-dim)",
            }}
            title="Unified view"
          >
            <AlignJustify size={14} strokeWidth={1.5} />
          </button>
          <button
            onClick={() => setViewType("split")}
            className="p-1.5 rounded transition-colors"
            style={{
              backgroundColor: viewType === "split" ? "var(--bg-elevated)" : "transparent",
              color: viewType === "split" ? "var(--accent-cyan)" : "var(--text-dim)",
            }}
            title="Split view"
          >
            <Columns2 size={14} strokeWidth={1.5} />
          </button>
        </div>
      )}

      {/* Diff content with expand controls */}
      {files.map((file, fileIndex) => {
        const hunks = file.hunks as HunkData[];

        // Debug: log whether comment support is enabled
        console.log("[DiffViewer] Rendering file:", file.newPath, "onAddComment:", !!onAddComment, "at", new Date().toISOString());

        // Custom gutter renderer that handles clicks for comments
        const renderGutter = onAddComment
          ? ({ change, renderDefault, wrapInAnchor }: { change: unknown; renderDefault: () => React.ReactNode; wrapInAnchor: (element: React.ReactNode) => React.ReactNode }) => {
              return (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log("[DiffViewer] Gutter span clicked, change:", change);
                    handleGutterClick(change);
                  }}
                  style={{ cursor: 'pointer', display: 'block', width: '100%', height: '100%' }}
                >
                  {wrapInAnchor(renderDefault())}
                </span>
              );
            }
          : undefined;

        return (
          <div key={`${file.oldPath}-${file.newPath}-${fileIndex}`}>
            {/* Expand up control at top if first hunk doesn't start at line 1 */}
            {onExpandContext && hunks.length > 0 && hunks[0].oldStart > 1 && (
              <ExpandControl
                direction="up"
                onClick={onExpandContext}
                disabled={loadingContext}
              />
            )}

            <Diff
              viewType={effectiveViewType}
              diffType={file.type}
              hunks={hunks}
              tokens={tokens}
              renderGutter={renderGutter}
              widgets={onAddComment ? buildWidgets(hunks, activeChangeKey, comments, fileName || '', handleCommentSubmit, () => { onSetActiveCommentLine?.(null); setActiveChangeKey(null); }, getCommentsForLine) : undefined}
              className={onAddComment ? "diff-with-comments" : undefined}
            >
              {(diffHunks: HunkData[]) =>
                diffHunks.map((hunk) => (
                  <Hunk key={hunk.content} hunk={hunk} />
                ))
              }
            </Diff>

            {/* Expand down control at bottom */}
            {onExpandContext && hunks.length > 0 && (
              <ExpandControl
                direction="down"
                onClick={onExpandContext}
                disabled={loadingContext}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Expand control component for showing context
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
