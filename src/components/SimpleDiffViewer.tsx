import { useCallback } from "react";
import { MessageSquare } from "lucide-react";
import { DiffRow } from "./DiffRow";
import { CommentInput, type ReviewComment } from "./ReviewComment";
import type { StructuredFileDiff } from "@/types/agent";
import { cn } from "@/lib/utils";

interface SimpleDiffViewerProps {
  diff: StructuredFileDiff;
  fileName?: string;
  onExpandContext?: () => void;
  loadingContext?: boolean;
  comments?: ReviewComment[];
  onAddComment?: (lineNumber: number, content: string, sendImmediately: boolean) => void;
  activeCommentLine?: number | null;
  onSetActiveCommentLine?: (lineNumber: number | null) => void;
}

export function SimpleDiffViewer({
  diff,
  fileName,
  comments = [],
  onAddComment,
  activeCommentLine,
  onSetActiveCommentLine,
}: SimpleDiffViewerProps) {
  const getCommentsForLine = useCallback(
    (lineNumber: number) => comments.filter((c) => c.lineNumber === lineNumber),
    [comments]
  );

  const handleRowClick = useCallback(
    (lineNum: number) => {
      if (!onSetActiveCommentLine) return;

      // Toggle: if clicking the same line, close; otherwise open
      if (activeCommentLine === lineNum) {
        onSetActiveCommentLine(null);
      } else {
        onSetActiveCommentLine(lineNum);
      }
    },
    [activeCommentLine, onSetActiveCommentLine]
  );

  const handleCommentSubmit = useCallback(
    (content: string, sendImmediately: boolean) => {
      if (activeCommentLine && onAddComment) {
        onAddComment(activeCommentLine, content, sendImmediately);
        onSetActiveCommentLine?.(null);
      }
    },
    [activeCommentLine, onAddComment, onSetActiveCommentLine]
  );

  const handleCancelComment = useCallback(() => {
    onSetActiveCommentLine?.(null);
  }, [onSetActiveCommentLine]);

  // Handle binary files
  if (diff.is_binary) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Binary file
      </div>
    );
  }

  // Handle empty diffs
  if (diff.hunks.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        No changes
      </div>
    );
  }

  return (
    <div className="diff-viewer h-full overflow-auto font-mono text-xs">
      {diff.hunks.map((hunk, hunkIdx) => (
        <div key={hunkIdx}>
          {/* Hunk header */}
          <div className="bg-muted/30 px-3 py-1 text-xs italic text-primary">
            {hunk.header}
          </div>

          {/* Hunk lines */}
          {hunk.lines.map((line, lineIdx) => {
            const lineNum = line.new_line_num ?? line.old_line_num;
            const lineComments = lineNum ? getCommentsForLine(lineNum) : [];
            const isActiveCommentLine = activeCommentLine === lineNum;
            const canComment = onAddComment && lineNum;
            const hasComment = lineComments.length > 0;
            // Skip syntax highlighting - just show plain text
            const highlightedCode = line.content;

            return (
              <div key={`${hunkIdx}-${lineIdx}`}>
                <DiffRow
                  lineType={line.line_type}
                  content={line.content}
                  oldLineNum={line.old_line_num}
                  newLineNum={line.new_line_num}
                  highlightedCode={highlightedCode}
                  canComment={!!canComment}
                  hasComment={hasComment}
                  onClickGutter={() => lineNum && canComment && handleRowClick(lineNum)}
                />

                {/* Comments and comment input */}
                {(lineComments.length > 0 || isActiveCommentLine) && (
                  <div className="bg-card px-2 py-1">
                    {/* Existing comments */}
                    {lineComments.map((comment) => (
                      <div
                        key={comment.id}
                        className={cn(
                          "flex items-start gap-2 px-2 py-1 mb-1 text-xs",
                          "bg-primary/5 border-l-2 border-primary rounded"
                        )}
                      >
                        <MessageSquare
                          size={12}
                          strokeWidth={1.5}
                          className="text-primary shrink-0 mt-0.5"
                        />
                        <span className="text-muted-foreground">{comment.content}</span>
                      </div>
                    ))}
                    {/* Comment input */}
                    {isActiveCommentLine && lineNum && (
                      <CommentInput
                        filePath={fileName || ""}
                        lineNumber={lineNum}
                        onSubmit={handleCommentSubmit}
                        onCancel={handleCancelComment}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
