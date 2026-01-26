import { useReview } from "../contexts/ReviewContext";

interface ReviewSummaryProps {
  onSendReview: (prompt: string) => void;
  selectedFilePaths?: string[];
}

export function ReviewSummary({ onSendReview }: ReviewSummaryProps) {
  const review = useReview();
  const { comments, selectedFiles } = review.state;

  const hasContent = comments.length > 0 || selectedFiles.size > 0;

  // Group comments by file
  const commentsByFile = comments.reduce((acc, comment) => {
    if (!acc[comment.filePath]) {
      acc[comment.filePath] = [];
    }
    acc[comment.filePath].push(comment);
    return acc;
  }, {} as Record<string, typeof comments>);

  const formatReviewPrompt = (): string => {
    const lines: string[] = ["Please address the following review comments and selections:\n"];

    // Add comments
    for (const [filePath, fileComments] of Object.entries(commentsByFile)) {
      lines.push(`## ${filePath}`);
      for (const comment of fileComments) {
        const lineInfo = comment.lineType === "old"
          ? `Line ${comment.lineNumber} (deleted)`
          : comment.lineType === "new"
            ? `Line ${comment.lineNumber} (added)`
            : `Line ${comment.lineNumber}`;
        lines.push(`- ${lineInfo}: ${comment.content}`);
      }
      lines.push("");
    }

    // Add selected files without comments
    const selectedFilesWithoutComments = Array.from(selectedFiles).filter(
      (path) => !commentsByFile[path]
    );

    if (selectedFilesWithoutComments.length > 0) {
      lines.push("## Selected files for review");
      for (const path of selectedFilesWithoutComments) {
        lines.push(`- ${path}`);
      }
      lines.push("");
    }

    return lines.join("\n");
  };

  const handleSendReview = () => {
    const prompt = formatReviewPrompt();
    onSendReview(prompt);
    review.clearReview();
  };

  if (!hasContent) {
    return (
      <div
        className="p-4 text-xs italic text-center"
        style={{ color: 'var(--text-dim)' }}
      >
        No review comments or selections yet.
        <br />
        <br />
        Click on diff lines to add comments, or select files using the checkboxes.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="px-4 py-2 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--border-default)' }}
      >
        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
          REVIEW SUMMARY
        </span>
        <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
          {comments.length} comment{comments.length !== 1 ? 's' : ''},
          {' '}{selectedFiles.size} file{selectedFiles.size !== 1 ? 's' : ''} selected
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-2">
        {/* Comments by file */}
        {Object.entries(commentsByFile).map(([filePath, fileComments]) => (
          <div
            key={filePath}
            className="mb-3"
          >
            <div
              className="text-xs font-medium mb-1 truncate"
              style={{ color: 'var(--text-primary)' }}
              title={filePath}
            >
              {filePath}
            </div>
            {fileComments.map((comment) => (
              <div
                key={comment.id}
                className="ml-2 p-2 mb-1 rounded text-xs"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderLeft: '2px solid var(--accent-cyan)',
                }}
              >
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span style={{ color: 'var(--text-dim)' }}>
                      Line {comment.lineNumber}
                      {comment.lineType === "old" && " (deleted)"}
                      {comment.lineType === "new" && " (added)"}
                      :
                    </span>
                    <p
                      className="mt-1 whitespace-pre-wrap"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      {comment.content}
                    </p>
                  </div>
                  <button
                    onClick={() => review.removeComment(comment.id)}
                    className="text-xs flex-shrink-0 transition-colors"
                    style={{ color: 'var(--text-dim)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}

        {/* Selected files without comments */}
        {Array.from(selectedFiles)
          .filter((path) => !commentsByFile[path])
          .length > 0 && (
          <div className="mb-3">
            <div
              className="text-xs font-medium mb-1"
              style={{ color: 'var(--text-primary)' }}
            >
              Selected for review:
            </div>
            {Array.from(selectedFiles)
              .filter((path) => !commentsByFile[path])
              .map((path) => (
                <div
                  key={path}
                  className="ml-2 p-2 mb-1 rounded text-xs flex justify-between items-center"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    borderLeft: '2px solid var(--accent-yellow)',
                  }}
                >
                  <span
                    className="truncate"
                    style={{ color: 'var(--text-secondary)' }}
                    title={path}
                  >
                    {path}
                  </span>
                  <button
                    onClick={() => review.toggleFileSelection(path)}
                    className="text-xs flex-shrink-0 ml-2 transition-colors"
                    style={{ color: 'var(--text-dim)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
                  >
                    ×
                  </button>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Send Review button */}
      <div
        className="p-3"
        style={{ borderTop: '1px solid var(--border-default)' }}
      >
        <button
          onClick={handleSendReview}
          className="w-full px-4 py-2 text-xs font-medium rounded transition-colors"
          style={{
            backgroundColor: 'var(--accent-cyan)',
            color: 'var(--bg-primary)',
          }}
          onMouseEnter={(e) => e.currentTarget.style.opacity = '0.9'}
          onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
        >
          Request Changes ({comments.length + selectedFiles.size})
        </button>
        <button
          onClick={() => review.clearReview()}
          className="w-full mt-2 px-4 py-1 text-xs rounded transition-colors"
          style={{
            color: 'var(--text-dim)',
            border: '1px solid var(--border-default)',
          }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
        >
          Clear Review
        </button>
      </div>
    </div>
  );
}
