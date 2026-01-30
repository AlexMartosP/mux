import { useState, useEffect, useRef } from "react";
import { MessageSquare, X, Send, Eye } from "lucide-react";
import { Button } from "./Button";

export interface ReviewComment {
  id: string;
  filePath: string;
  lineNumber: number;
  content: string;
  timestamp: string;
}

interface CommentInputProps {
  filePath: string;
  lineNumber: number;
  onSubmit: (content: string, sendImmediately: boolean) => void;
  onCancel: () => void;
}

export function CommentInput({ filePath, lineNumber, onSubmit, onCancel }: CommentInputProps) {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = (sendImmediately: boolean) => {
    if (!content.trim()) return;
    onSubmit(content.trim(), sendImmediately);
    setContent("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(true); // Cmd/Ctrl+Enter sends immediately
    } else if (e.key === "Escape") {
      onCancel();
    }
  };

  return (
    <div
      className="p-2"
      style={{
        backgroundColor: "var(--bg-elevated)",
        borderRadius: "var(--border-radius)",
      }}
    >
      <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: "var(--text-dim)" }}>
        <MessageSquare size={12} strokeWidth={1.5} />
        <span>Comment on line {lineNumber}</span>
        <span className="text-xs truncate flex-1" style={{ color: "var(--text-dim)" }}>
          {filePath.split('/').pop()}
        </span>
        <button
          onClick={onCancel}
          className="p-0.5 rounded transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-dim)" }}
        >
          <X size={12} strokeWidth={1.5} />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Describe the issue or suggestion..."
        rows={2}
        className="w-full text-xs resize-none bg-transparent border-none outline-none"
        style={{ color: "var(--text-primary)" }}
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
          Cmd+Enter to send now
        </span>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            onClick={() => handleSubmit(false)}
            disabled={!content.trim()}
            title="Add to review (send later)"
          >
            Add
          </Button>
          <Button
            variant="primary"
            onClick={() => handleSubmit(true)}
            disabled={!content.trim()}
            title="Send to Claude immediately"
          >
            <Send size={12} strokeWidth={1.5} className="mr-1" />
            Send now
          </Button>
        </div>
      </div>
    </div>
  );
}

interface CommentsPopoverProps {
  comments: ReviewComment[];
  onRemove: (id: string) => void;
  onClose: () => void;
}

export function CommentsPopover({ comments, onRemove, onClose }: CommentsPopoverProps) {
  if (comments.length === 0) {
    return (
      <div
        className="p-3 text-xs text-center"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-active)",
          borderRadius: "var(--border-radius)",
          color: "var(--text-dim)",
        }}
      >
        No pending comments
      </div>
    );
  }

  return (
    <div
      className="max-h-60 overflow-y-auto"
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-active)",
        borderRadius: "var(--border-radius)",
      }}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid var(--border-default)" }}
      >
        <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
          Pending Comments ({comments.length})
        </span>
        <button
          onClick={onClose}
          className="p-0.5 rounded transition-colors hover:bg-[var(--bg-hover)]"
          style={{ color: "var(--text-dim)" }}
        >
          <X size={12} strokeWidth={1.5} />
        </button>
      </div>
      {comments.map((comment) => (
        <div
          key={comment.id}
          className="px-3 py-2 group"
          style={{ borderBottom: "1px solid var(--border-default)" }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: "var(--accent-cyan)" }}>
                {comment.filePath.split('/').pop()}
              </span>
              <span style={{ color: "var(--text-dim)" }}>
                line {comment.lineNumber}
              </span>
            </div>
            <button
              onClick={() => onRemove(comment.id)}
              className="opacity-0 group-hover:opacity-100 p-0.5 rounded transition-all hover:bg-[var(--bg-hover)]"
              style={{ color: "var(--accent-red)" }}
              title="Remove comment"
            >
              <X size={12} strokeWidth={1.5} />
            </button>
          </div>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {comment.content}
          </p>
        </div>
      ))}
    </div>
  );
}

interface ReviewActionsBarProps {
  comments: ReviewComment[];
  onSendAll: () => void;
  onViewComments: () => void;
  showCommentsPopover: boolean;
  onRemoveComment: (id: string) => void;
  onClosePopover: () => void;
}

export function ReviewActionsBar({
  comments,
  onSendAll,
  onViewComments,
  showCommentsPopover,
  onRemoveComment,
  onClosePopover,
}: ReviewActionsBarProps) {
  if (comments.length === 0) return null;

  return (
    <div
      className="flex-shrink-0 px-3 py-2 relative"
      style={{
        backgroundColor: "var(--bg-surface)",
        borderTop: "1px solid var(--border-default)",
      }}
    >
      {/* Comments popover */}
      {showCommentsPopover && (
        <div
          className="absolute bottom-full left-3 right-3 mb-1"
          style={{ zIndex: "var(--z-dropdown)" }}
        >
          <CommentsPopover
            comments={comments}
            onRemove={onRemoveComment}
            onClose={onClosePopover}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={onViewComments}
        >
          <Eye size={14} strokeWidth={1.5} className="mr-1" />
          View ({comments.length})
        </Button>
        <Button
          variant="primary"
          color="green"
          onClick={onSendAll}
        >
          <Send size={14} strokeWidth={1.5} className="mr-1" />
          Request Changes
        </Button>
      </div>
    </div>
  );
}
