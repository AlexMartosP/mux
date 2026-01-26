import type { FileChange, FileStatus } from "../types/task";
import { FileStatusIcon } from "./FileStatusIcon";
import { useReview } from "../contexts/ReviewContext";

interface FileTreeProps {
  files: FileChange[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  enableSelection?: boolean;
}

export function FileTree({
  files,
  selectedFile,
  onSelectFile,
  enableSelection = false,
}: FileTreeProps) {
  const review = useReview();

  if (files.length === 0) {
    return (
      <div className="p-4 text-xs italic" style={{ color: 'var(--text-dim)' }}>
        No changed files
      </div>
    );
  }

  const allSelected = enableSelection && files.every(f => review.isFileSelected(f.path));
  const someSelected = enableSelection && files.some(f => review.isFileSelected(f.path));

  return (
    <div className="overflow-auto">
      {/* Select All header */}
      {enableSelection && (
        <div
          className="px-3 py-2 flex items-center gap-2"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={() => {
              if (allSelected) {
                review.deselectAll();
              } else {
                review.selectAllFiles(files.map(f => f.path));
              }
            }}
            className="w-3 h-3 cursor-pointer"
            style={{ accentColor: 'var(--accent-cyan)' }}
          />
          <span
            className="text-xs"
            style={{ color: 'var(--text-dim)' }}
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </span>
        </div>
      )}

      {files.map((file) => {
        const isSelected = selectedFile === file.path;
        const isChecked = enableSelection && review.isFileSelected(file.path);
        const statusColor = getStatusColor(file.status);

        return (
          <div
            key={file.path}
            className="flex items-center"
            style={{
              backgroundColor: isSelected ? 'var(--bg-elevated)' : isChecked ? 'rgba(0, 255, 255, 0.05)' : 'transparent',
              borderLeft: isSelected ? `2px solid ${statusColor}` : isChecked ? '2px solid var(--accent-cyan)' : '2px solid transparent',
              borderBottom: '1px solid var(--border-default)',
            }}
          >
            {/* Checkbox */}
            {enableSelection && (
              <div className="pl-3">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => {
                    e.stopPropagation();
                    review.toggleFileSelection(file.path);
                  }}
                  className="w-3 h-3 cursor-pointer"
                  style={{ accentColor: 'var(--accent-cyan)' }}
                />
              </div>
            )}

            {/* File button */}
            <button
              onClick={() => onSelectFile(file.path)}
              className="flex-1 text-left px-3 py-2 flex items-center gap-2 transition-colors"
              onMouseEnter={(e) => {
                if (!isSelected) {
                  e.currentTarget.parentElement!.style.backgroundColor = 'var(--bg-elevated)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  e.currentTarget.parentElement!.style.backgroundColor = isChecked ? 'rgba(0, 255, 255, 0.05)' : 'transparent';
                }
              }}
            >
              <FileStatusIcon status={file.status} size={14} />
              <span
                className="flex-1 truncate text-xs"
                style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              >
                {file.path}
              </span>
              <span className="flex-shrink-0 text-xs">
                {file.additions > 0 && (
                  <span style={{ color: 'var(--accent-green)' }}>+{file.additions}</span>
                )}
                {file.additions > 0 && file.deletions > 0 && (
                  <span style={{ color: 'var(--text-dim)' }}>/</span>
                )}
                {file.deletions > 0 && (
                  <span style={{ color: 'var(--accent-red)' }}>-{file.deletions}</span>
                )}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function getStatusColor(status: FileStatus): string {
  switch (status) {
    case "added":
      return "var(--accent-green)";
    case "modified":
      return "var(--accent-yellow)";
    case "deleted":
      return "var(--accent-red)";
    case "renamed":
      return "var(--accent-cyan)";
    case "copied":
      return "var(--accent-magenta)";
    case "untracked":
    default:
      return "var(--text-dim)";
  }
}
