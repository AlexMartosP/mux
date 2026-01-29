import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, RefreshCw, RotateCcw, X, FilePlus, FileEdit, FileX, ChevronsUpDown } from "lucide-react";
import { DiffViewer } from "./DiffViewer";
import { Button } from "./Button";
import { getTaskChanges, getFileDiff, getFileDiffWithContext, revertFileChanges, refreshTaskGitStats } from "../lib/tauri";
import type { FileChange, FileDiff } from "../types/task";

interface ChangesPanelProps {
  taskId: string;
  onSendReview?: (prompt: string) => void;
  isFullScreen?: boolean;
  onExitFullScreen?: () => void;
}

export function ChangesPanel({
  taskId,
  onSendReview: _onSendReview, // TODO: Re-enable review functionality
  isFullScreen = false,
  onExitFullScreen,
}: ChangesPanelProps) {
  const [files, setFiles] = useState<FileChange[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<FileDiff | null>(null);
  const [contextLines, setContextLines] = useState(3);
  const [loading, setLoading] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFullScreen, setShowFullScreen] = useState(false);

  const loadChanges = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const changedFiles = await getTaskChanges(taskId);
      setFiles(changedFiles);

      // Refresh git stats in the background (updates sidebar display)
      refreshTaskGitStats(taskId).catch(console.error);

      if (changedFiles.length > 0 && !selectedFile) {
        handleSelectFile(changedFiles[0].path);
      } else if (selectedFile) {
        const fileStillExists = changedFiles.some(f => f.path === selectedFile);
        if (fileStillExists) {
          try {
            const diff = await getFileDiff(taskId, selectedFile);
            setFileDiff(diff);
          } catch (err) {
            console.error("Failed to refresh diff:", err);
          }
        } else {
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

  // Handle Escape key to close full-screen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showFullScreen) {
          setShowFullScreen(false);
        } else if (isFullScreen && onExitFullScreen) {
          onExitFullScreen();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showFullScreen, isFullScreen, onExitFullScreen]);

  const handleSelectFile = async (path: string) => {
    setSelectedFile(path);
    setContextLines(3);
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

  const handleRevert = async () => {
    if (!selectedFile) return;
    const confirmed = window.confirm(`Revert all changes to ${selectedFile}?`);
    if (!confirmed) return;
    try {
      await revertFileChanges(taskId, selectedFile);
      await loadChanges();
    } catch (err) {
      console.error("Failed to revert:", err);
    }
  };

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

  // Get filename from path
  const getFileName = (path: string) => path.split('/').pop() || path;

  // Get status icon component
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'added':
        return <FilePlus size={14} strokeWidth={1.5} />;
      case 'deleted':
        return <FileX size={14} strokeWidth={1.5} />;
      default:
        return <FileEdit size={14} strokeWidth={1.5} />;
    }
  };

  // Horizontal file list for compact view
  const HorizontalFileList = () => (
    <div className="flex gap-1 px-2 py-2 overflow-x-auto">
      {files.map((file) => {
        const isSelected = selectedFile === file.path;
        const isDeleted = file.status === 'deleted';

        return (
          <button
            key={file.path}
            onClick={() => !isDeleted && handleSelectFile(file.path)}
            className="flex-shrink-0 flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors"
            style={{
              backgroundColor: isSelected ? 'var(--bg-accent-subtle)' : 'transparent',
              color: isDeleted
                ? 'var(--accent-red)'
                : isSelected
                  ? 'var(--accent-cyan)'
                  : 'var(--text-dim)',
              cursor: isDeleted ? 'not-allowed' : 'pointer',
              opacity: isDeleted ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isSelected && !isDeleted) {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = isDeleted
                  ? 'var(--accent-red)'
                  : 'var(--text-dim)';
              }
            }}
            title={isDeleted ? `${file.path} (deleted)` : file.path}
            disabled={isDeleted}
          >
            {getStatusIcon(file.status)}
            <span>{getFileName(file.path)}</span>
            {(file.additions > 0 || file.deletions > 0) && (
              <span className="flex items-center gap-0.5 text-xs">
                {file.additions > 0 && (
                  <span style={{ color: 'var(--accent-green)' }}>+{file.additions}</span>
                )}
                {file.deletions > 0 && (
                  <span style={{ color: 'var(--accent-red)' }}>-{file.deletions}</span>
                )}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  // Vertical file list for full-screen view
  const VerticalFileList = () => (
    <div className="flex flex-col">
      {files.map((file) => {
        const isSelected = selectedFile === file.path;
        const isDeleted = file.status === 'deleted';

        return (
          <button
            key={file.path}
            onClick={() => !isDeleted && handleSelectFile(file.path)}
            className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors"
            style={{
              backgroundColor: isSelected ? 'var(--bg-accent-subtle)' : 'transparent',
              color: isDeleted
                ? 'var(--accent-red)'
                : isSelected
                  ? 'var(--text-primary)'
                  : 'var(--text-secondary)',
              cursor: isDeleted ? 'not-allowed' : 'pointer',
              opacity: isDeleted ? 0.6 : 1,
            }}
            onMouseEnter={(e) => {
              if (!isSelected && !isDeleted) {
                e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isSelected) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
            title={isDeleted ? `${file.path} (deleted)` : file.path}
            disabled={isDeleted}
          >
            {getStatusIcon(file.status)}
            <span className="truncate flex-1">{getFileName(file.path)}</span>
            <span className="flex items-center gap-1 flex-shrink-0">
              {file.additions > 0 && (
                <span style={{ color: 'var(--accent-green)' }}>+{file.additions}</span>
              )}
              {file.deletions > 0 && (
                <span style={{ color: 'var(--accent-red)' }}>-{file.deletions}</span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );

  // Full-screen modal
  const fullScreenModal = showFullScreen && createPortal(
    <div
      className="fixed inset-0 z-50 flex"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Left: File list */}
      <div
        className="flex flex-col flex-shrink-0"
        style={{
          width: '280px',
          borderRight: '1px solid var(--border-default)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {files.length} files
            </span>
            {totalChanges.additions > 0 && (
              <span className="text-xs" style={{ color: 'var(--accent-green)' }}>+{totalChanges.additions}</span>
            )}
            {totalChanges.deletions > 0 && (
              <span className="text-xs" style={{ color: 'var(--accent-red)' }}>-{totalChanges.deletions}</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowFullScreen(false)}
            title="Exit full screen (ESC)"
          >
            <Minimize2 size={14} strokeWidth={1.5} />
          </Button>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-auto">
          <VerticalFileList />
        </div>
      </div>

      {/* Right: Diff viewer */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Diff header */}
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
              {selectedFile || 'No file selected'}
            </span>
            {fileDiff && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLoadMoreContext}
                disabled={loadingContext}
                title="Expand all context"
              >
                <ChevronsUpDown size={14} strokeWidth={1.5} />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {fileDiff && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRevert}
                title="Revert changes"
              >
                <RotateCcw size={14} strokeWidth={1.5} />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={loadChanges}
              title="Refresh"
            >
              <RefreshCw size={14} strokeWidth={1.5} />
            </Button>
          </div>
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-auto">
          {fileDiff ? (
            <DiffViewer
              diff={fileDiff.diff}
              fileName={fileDiff.path}
              onExpandContext={handleLoadMoreContext}
              loadingContext={loadingContext}
              isFullScreen
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
      </div>
    </div>,
    document.body
  );

  // Sidebar view (default)
  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: 'var(--bg-primary)' }}>
      {fullScreenModal}

      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-default)' }}
      >
        <div className="flex items-center gap-2">
          {isFullScreen && onExitFullScreen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onExitFullScreen}
              title="Close"
            >
              <X size={14} strokeWidth={1.5} />
            </Button>
          )}
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            {files.length} files
          </span>
          {totalChanges.additions > 0 && (
            <span className="text-xs" style={{ color: 'var(--accent-green)' }}>+{totalChanges.additions}</span>
          )}
          {totalChanges.deletions > 0 && (
            <span className="text-xs" style={{ color: 'var(--accent-red)' }}>-{totalChanges.deletions}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {fileDiff && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleLoadMoreContext}
              disabled={loadingContext}
              title="Expand all context"
            >
              <ChevronsUpDown size={14} strokeWidth={1.5} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={loadChanges}
            title="Refresh"
          >
            <RefreshCw size={14} strokeWidth={1.5} />
          </Button>
          {!isFullScreen && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowFullScreen(true)}
              title="Full screen"
            >
              <Maximize2 size={14} strokeWidth={1.5} />
            </Button>
          )}
        </div>
      </div>

      {/* Files area - horizontal scrollable */}
      <div
        className="flex-shrink-0"
        style={{
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <HorizontalFileList />
      </div>

      {/* Diff viewer */}
      <div className="flex-1 overflow-auto min-h-0">
        {fileDiff ? (
          <DiffViewer
            diff={fileDiff.diff}
            fileName={fileDiff.path}
            onExpandContext={handleLoadMoreContext}
            loadingContext={loadingContext}
          />
        ) : (
          <div
            className="flex items-center justify-center h-full text-xs"
            style={{ color: 'var(--text-dim)' }}
          >
            {files.length === 0 ? 'No changes' : 'Select a file to view changes'}
          </div>
        )}
      </div>
    </div>
  );
}
