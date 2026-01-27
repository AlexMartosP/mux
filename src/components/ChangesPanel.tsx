import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { FileTree } from "./FileTree";
import { DiffViewer } from "./DiffViewer";
import { CommitHistory } from "./CommitHistory";
import { ReviewSummary } from "./ReviewSummary";
import { useReview } from "../contexts/ReviewContext";
import { getTaskChanges, getFileDiff, getFileDiffWithContext, getTaskCommits, revertFileChanges } from "../lib/tauri";
import type { FileChange, FileDiff, CommitInfo } from "../types/task";

interface ChangesPanelProps {
  taskId: string;
  onSendReview?: (prompt: string) => void;
  onFullScreen?: () => void;
  isFullScreen?: boolean;
  onExitFullScreen?: () => void;
}

type Tab = "files" | "commits" | "review";

export function ChangesPanel({
  taskId,
  onSendReview,
  onFullScreen,
  isFullScreen = false,
  onExitFullScreen,
}: ChangesPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("files");
  const review = useReview();
  const [files, setFiles] = useState<FileChange[]>([]);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<FileDiff | null>(null);
  const [contextLines, setContextLines] = useState(3);
  const [loading, setLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDiffFullScreen, setIsDiffFullScreen] = useState(false);
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(false);

  const loadChanges = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [changedFiles, commitHistory] = await Promise.all([
        getTaskChanges(taskId),
        getTaskCommits(taskId, 20)
      ]);
      setFiles(changedFiles);
      setCommits(commitHistory);

      if (changedFiles.length > 0 && !selectedFile) {
        // Auto-select first file if none selected
        handleSelectFile(changedFiles[0].path);
      } else if (selectedFile) {
        // Refresh the diff for the currently selected file
        const fileStillExists = changedFiles.some(f => f.path === selectedFile);
        if (fileStillExists) {
          try {
            const diff = await getFileDiff(taskId, selectedFile);
            setFileDiff(diff);
          } catch (err) {
            console.error("Failed to refresh diff:", err);
          }
        } else {
          // File no longer in changes, select first file or clear
          if (changedFiles.length > 0) {
            handleSelectFile(changedFiles[0].path);
          } else {
            setSelectedFile(null);
            setFileDiff(null);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load changes");
    } finally {
      setLoading(false);
    }
  }, [taskId, selectedFile]);

  useEffect(() => {
    loadChanges();
    const interval = setInterval(loadChanges, 10000);
    return () => clearInterval(interval);
  }, [loadChanges]);

  // Handle Escape key to close full-screen modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isDiffFullScreen) {
          setIsDiffFullScreen(false);
        } else if (isFullScreen && onExitFullScreen) {
          onExitFullScreen();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDiffFullScreen, isFullScreen, onExitFullScreen]);

  const handleSelectFile = async (path: string) => {
    setSelectedFile(path);
    setContextLines(3); // Reset context when selecting a new file
    try {
      const diff = await getFileDiff(taskId, path);
      setFileDiff(diff);
    } catch (err) {
      console.error("Failed to load diff:", err);
      setFileDiff(null);
    }
  };

  const handleLoadMoreContext = useCallback(async () => {
    if (!selectedFile || loadingContext) return;

    setLoadingContext(true);
    const newContextLines = contextLines + 10;
    try {
      const diff = await getFileDiffWithContext(taskId, selectedFile, newContextLines);
      setFileDiff(diff);
      setContextLines(newContextLines);
    } catch (err) {
      console.error("Failed to load more context:", err);
    } finally {
      setLoadingContext(false);
    }
  }, [taskId, selectedFile, contextLines, loadingContext]);

  if (loading && files.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full text-xs"
        style={{ color: 'var(--text-dim)' }}
      >
        Loading changes...
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full gap-2 text-xs"
        style={{ color: 'var(--text-dim)' }}
      >
        <span>{error}</span>
        <button
          onClick={loadChanges}
          style={{ color: 'var(--accent-cyan)' }}
        >
          Retry
        </button>
      </div>
    );
  }

  const totalChanges = files.reduce(
    (acc, f) => ({ additions: acc.additions + f.additions, deletions: acc.deletions + f.deletions }),
    { additions: 0, deletions: 0 }
  );

  // Full-screen diff modal (for single file)
  const fullScreenModal = isDiffFullScreen && fileDiff && createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Full-screen header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-default)' }}
      >
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {fileDiff.path}
          </h3>
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Press ESC to exit
          </span>
        </div>
        <div className="flex items-center gap-4">
          {/* File navigation in full-screen */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const currentIndex = files.findIndex(f => f.path === selectedFile);
                if (currentIndex > 0) {
                  handleSelectFile(files[currentIndex - 1].path);
                }
              }}
              disabled={files.findIndex(f => f.path === selectedFile) === 0}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{
                color: files.findIndex(f => f.path === selectedFile) === 0
                  ? 'var(--text-dim)'
                  : 'var(--text-secondary)',
                border: '1px solid var(--border-default)',
                cursor: files.findIndex(f => f.path === selectedFile) === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              ← Prev
            </button>
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
              {files.findIndex(f => f.path === selectedFile) + 1} / {files.length}
            </span>
            <button
              onClick={() => {
                const currentIndex = files.findIndex(f => f.path === selectedFile);
                if (currentIndex < files.length - 1) {
                  handleSelectFile(files[currentIndex + 1].path);
                }
              }}
              disabled={files.findIndex(f => f.path === selectedFile) === files.length - 1}
              className="text-xs px-2 py-1 rounded transition-colors"
              style={{
                color: files.findIndex(f => f.path === selectedFile) === files.length - 1
                  ? 'var(--text-dim)'
                  : 'var(--text-secondary)',
                border: '1px solid var(--border-default)',
                cursor: files.findIndex(f => f.path === selectedFile) === files.length - 1 ? 'not-allowed' : 'pointer',
              }}
            >
              Next →
            </button>
          </div>
          <button
            onClick={() => setIsDiffFullScreen(false)}
            className="text-xs transition-colors"
            style={{ color: 'var(--accent-cyan)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
          >
            [CLOSE]
          </button>
        </div>
      </div>

      {/* Full-screen content */}
      <div className="flex-1 overflow-auto">
        <DiffViewer
          diff={fileDiff.diff}
          fileName={fileDiff.path}
          onLoadMoreContext={handleLoadMoreContext}
          loadingContext={loadingContext}
        />
      </div>
    </div>,
    document.body
  );

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {fullScreenModal}

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ borderBottom: '1px solid var(--border-default)' }}
      >
        <div className="flex items-center gap-4">
          {isFullScreen && onExitFullScreen && (
            <button
              onClick={onExitFullScreen}
              className="text-xs transition-colors mr-2"
              style={{ color: 'var(--accent-cyan)' }}
              title="Exit full screen (ESC)"
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
            >
              ←
            </button>
          )}
          <h3 className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>CHANGES</h3>
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
            {files.length} file{files.length !== 1 ? "s" : ""}
            {totalChanges.additions > 0 && (
              <span className="ml-2" style={{ color: 'var(--accent-green)' }}>+{totalChanges.additions}</span>
            )}
            {totalChanges.deletions > 0 && (
              <span className="ml-1" style={{ color: 'var(--accent-red)' }}>-{totalChanges.deletions}</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {fileDiff && activeTab === "files" && (
            <button
              onClick={async () => {
                if (!selectedFile) return;
                const confirmed = window.confirm(`Revert all changes to ${selectedFile}?`);
                if (!confirmed) return;
                try {
                  await revertFileChanges(taskId, selectedFile);
                  await loadChanges();
                } catch (err) {
                  console.error("Failed to revert:", err);
                }
              }}
              className="text-xs transition-colors"
              style={{ color: 'var(--text-dim)' }}
              title="Revert this file's changes"
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
            >
              [REVERT]
            </button>
          )}
          {fileDiff && activeTab === "files" && !isFullScreen && (
            <button
              onClick={() => setIsDiffFullScreen(true)}
              className="text-xs transition-colors"
              style={{ color: 'var(--text-dim)' }}
              title="Expand diff (ESC to close)"
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
            >
              [EXPAND]
            </button>
          )}
          {!isFullScreen && onFullScreen && (
            <button
              onClick={onFullScreen}
              className="text-xs transition-colors"
              style={{ color: 'var(--text-dim)' }}
              title="Full screen panel"
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
            >
              [FULL]
            </button>
          )}
          <button
            onClick={loadChanges}
            className="text-xs transition-colors"
            style={{ color: 'var(--text-dim)' }}
            title="Refresh"
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
          >
            [REFRESH]
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex" style={{ borderBottom: '1px solid var(--border-default)' }}>
        <button
          onClick={() => setActiveTab("files")}
          className="px-4 py-2 text-xs font-medium transition-colors"
          style={{
            color: activeTab === "files" ? 'var(--text-primary)' : 'var(--text-dim)',
            borderBottom: activeTab === "files" ? '1px solid var(--accent-cyan)' : '1px solid transparent',
          }}
        >
          FILES ({files.length})
        </button>
        <button
          onClick={() => setActiveTab("commits")}
          className="px-4 py-2 text-xs font-medium transition-colors"
          style={{
            color: activeTab === "commits" ? 'var(--text-primary)' : 'var(--text-dim)',
            borderBottom: activeTab === "commits" ? '1px solid var(--accent-cyan)' : '1px solid transparent',
          }}
        >
          COMMITS ({commits.length})
        </button>
        <button
          onClick={() => setActiveTab("review")}
          className="px-4 py-2 text-xs font-medium transition-colors"
          style={{
            color: activeTab === "review" ? 'var(--text-primary)' : 'var(--text-dim)',
            borderBottom: activeTab === "review" ? '1px solid var(--accent-cyan)' : '1px solid transparent',
          }}
        >
          REVIEW
          {(review.hasComments() || review.hasSelections()) && (
            <span
              className="ml-1 px-1.5 rounded text-xs"
              style={{
                backgroundColor: 'var(--accent-cyan)',
                color: 'var(--bg-primary)',
              }}
            >
              {review.state.comments.length + review.state.selectedFiles.size}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {activeTab === "files" && (
          <>
            {/* File list - collapsible */}
            <div
              className="flex-shrink-0 overflow-hidden flex flex-col transition-all duration-200"
              style={{
                width: fileTreeCollapsed ? 32 : (isFullScreen ? 280 : 200),
                borderRight: '1px solid var(--border-default)',
              }}
            >
              {/* Collapse toggle */}
              <button
                onClick={() => setFileTreeCollapsed(!fileTreeCollapsed)}
                className="w-full px-2 py-1.5 text-xs flex items-center justify-center transition-colors"
                style={{
                  borderBottom: '1px solid var(--border-default)',
                  color: 'var(--text-dim)',
                  backgroundColor: 'var(--bg-surface)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
                title={fileTreeCollapsed ? "Show file tree" : "Hide file tree"}
              >
                {fileTreeCollapsed ? '»' : '«'}
              </button>
              {!fileTreeCollapsed && (
                <div className="flex-1 overflow-auto">
                  <FileTree
                    files={files}
                    selectedFile={selectedFile}
                    onSelectFile={handleSelectFile}
                    enableSelection
                  />
                </div>
              )}
            </div>

            {/* Diff view */}
            <div className="flex-1 overflow-auto">
              {fileDiff ? (
                <DiffViewer
                  diff={fileDiff.diff}
                  fileName={fileDiff.path}
                  onLoadMoreContext={handleLoadMoreContext}
                  loadingContext={loadingContext}
                  enableComments
                />
              ) : (
                <div
                  className="flex items-center justify-center h-full text-xs"
                  style={{ color: 'var(--text-dim)' }}
                >
                  Select a file to view changes
                </div>
              )}
            </div>
          </>
        )}
        {activeTab === "commits" && (
          <div className="flex-1 overflow-auto">
            <CommitHistory commits={commits} />
          </div>
        )}
        {activeTab === "review" && (
          <div className="flex-1 overflow-auto">
            <ReviewSummary
              onSendReview={(prompt) => {
                if (onSendReview) {
                  onSendReview(prompt);
                  setActiveTab("files");
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
