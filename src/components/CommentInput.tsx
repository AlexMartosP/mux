import { useState, useRef, useEffect } from "react";

interface CommentInputProps {
  onSubmit: (content: string) => void;
  onCancel: () => void;
  initialValue?: string;
  lineNumber: number;
  lineType: "old" | "new" | "context";
}

export function CommentInput({
  onSubmit,
  onCancel,
  initialValue = "",
  lineNumber,
  lineType,
}: CommentInputProps) {
  const [content, setContent] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = () => {
    if (content.trim()) {
      onSubmit(content.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  const lineTypeLabel = lineType === "old" ? "deletion" : lineType === "new" ? "addition" : "line";

  return (
    <div
      className="p-2 rounded"
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div
        className="text-xs mb-2"
        style={{ color: "var(--text-dim)" }}
      >
        Comment on {lineTypeLabel} at line {lineNumber}
      </div>
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Add your comment..."
        className="w-full text-xs p-2 rounded resize-none"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-default)",
          color: "var(--text-primary)",
          minHeight: "60px",
        }}
        rows={3}
      />
      <div className="flex justify-between items-center mt-2">
        <span
          className="text-xs"
          style={{ color: "var(--text-dim)" }}
        >
          Cmd+Enter to submit, Esc to cancel
        </span>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-2 py-1 text-xs rounded transition-colors"
            style={{
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--text-secondary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!content.trim()}
            className="px-2 py-1 text-xs rounded transition-colors"
            style={{
              backgroundColor: content.trim()
                ? "var(--accent-cyan)"
                : "var(--bg-surface)",
              color: content.trim() ? "var(--bg-primary)" : "var(--text-dim)",
              cursor: content.trim() ? "pointer" : "not-allowed",
            }}
          >
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}

interface CommentBubbleProps {
  content: string;
  onEdit: () => void;
  onDelete: () => void;
}

export function CommentBubble({ content, onEdit, onDelete }: CommentBubbleProps) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className="mt-1 p-2 rounded text-xs"
      style={{
        backgroundColor: "rgba(0, 255, 255, 0.1)",
        borderLeft: "2px solid var(--accent-cyan)",
        color: "var(--text-secondary)",
      }}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex justify-between items-start gap-2">
        <p className="flex-1 whitespace-pre-wrap">{content}</p>
        {showActions && (
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={onEdit}
              className="text-xs transition-colors"
              style={{ color: "var(--text-dim)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--accent-cyan)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--text-dim)")
              }
            >
              edit
            </button>
            <button
              onClick={onDelete}
              className="text-xs transition-colors"
              style={{ color: "var(--text-dim)" }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = "var(--accent-red)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = "var(--text-dim)")
              }
            >
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
