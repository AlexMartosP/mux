import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2, RefreshCw, RotateCcw, X, FilePlus, FileEdit, FileX, ChevronsUpDown } from "lucide-react";
import { SimpleDiffViewer } from "./SimpleDiffViewer";
import { Button } from "./Button";
import { ReviewActionsBar, type ReviewComment } from "./ReviewComment";
import { getAgentChanges, getFileDiff, getFileDiffWithContext, revertFileChanges, refreshAgentGitStats } from "../lib/tauri";
import type { FileChange, FileDiff } from "../types/agent";

interface ChangesPanelProps {
  agentId: string;
  onSendReview?: (prompt: string) => void;
  isFullScreen?: boolean;
  onExitFullScreen?: () => void;
}

// Diff cache entry with timestamp for invalidation
interface DiffCacheEntry {
  diff: FileDiff;
  timestamp: number;
  contextLines: number;
}

// Cache TTL: 30 seconds (diffs can become stale if agent is making changes)
const CACHE_TTL = 30000;

export function ChangesPanel({
  agentId,
  onSendReview,
  isFullScreen = false,
  onExitFullScreen,
}: ChangesPanelProps) {
  const [files, setFiles] = useState<FileChange[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileDiff, setFileDiff] = useState<FileDiff | null>(null);
  const [contextLines, setContextLines] = useState(3);
  const [loading, setLoading] = useState(false);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [loadingContext, setLoadingContext] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFullScreen, setShowFullScreen] = useState(false);

  // Diff cache - persists across file switches within a task
  const diffCacheRef = useRef<Map<string, DiffCacheEntry>>(new Map());
  // Track current task to clear cache on task switch
  const currentTaskRef = useRef<string>(agentId);

  // Review comments state
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [activeCommentLine, setActiveCommentLine] = useState<number | null>(null);
  const [showCommentsPopover, setShowCommentsPopover] = useState(false);

  // Handle adding a comment
  const handleAddComment = useCallback((lineNumber: number, content: string, sendImmediately: boolean) => {
    if (!selectedFile) return;

    if (sendImmediately && onSendReview) {
      // Send immediately as a follow-up to Claude
      const prompt = `In ${selectedFile} at line ${lineNumber}:\n${content}`;
      onSendReview(prompt);
    } else {
      // Add to pending comments
      const newComment: ReviewComment = {
        id: crypto.randomUUID(),
        filePath: selectedFile,
        lineNumber,
        content,
        timestamp: new Date().toISOString(),
      };
      setComments(prev => [...prev, newComment]);
    }
    setActiveCommentLine(null);
  }, [selectedFile, onSendReview]);

  // Handle removing a comment
  const handleRemoveComment = useCallback((id: string) => {
    setComments(prev => prev.filter(c => c.id !== id));
  }, []);

  // Handle sending all comments
  const handleSendAllComments = useCallback(() => {
    if (comments.length === 0 || !onSendReview) return;

    // Group comments by file
    const grouped = comments.reduce((acc, c) => {
      if (!acc[c.filePath]) acc[c.filePath] = [];
      acc[c.filePath].push(c);
      return acc;
    }, {} as Record<string, ReviewComment[]>);

    // Build the review prompt
    let prompt = "Please address the following code review comments:\n\n";
    for (const [filePath, fileComments] of Object.entries(grouped)) {
      prompt += `**${filePath}**:\n`;
      for (const c of fileComments.sort((a, b) => a.lineNumber - b.lineNumber)) {
        prompt += `- Line ${c.lineNumber}: ${c.content}\n`;
      }
      prompt += "\n";
    }

    onSendReview(prompt.trim());
    setComments([]);
    setShowCommentsPopover(false);
  }, [comments, onSendReview]);

  // Get comments for the selected file
  const fileComments = selectedFile
    ? comments.filter(c => c.filePath === selectedFile)
    : [];

  // Clear cache when task changes
  useEffect(() => {
    if (agentId !== currentTaskRef.current) {
      diffCacheRef.current.clear();
      currentTaskRef.current = agentId;
    }
  }, [agentId]);

  // Get diff from cache or fetch it
  const getDiffForFile = useCallback(async (path: string, requestedContextLines: number): Promise<FileDiff | null> => {
    const cache = diffCacheRef.current;
    const cacheKey = `${path}:${requestedContextLines}`;
    const now = Date.now();

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && (now - cached.timestamp) < CACHE_TTL) {
      return cached.diff;
    }

    // Fetch from backend
    try {
      const diff = requestedContextLines > 3
        ? await getFileDiffWithContext(agentId, path, requestedContextLines)
        : await getFileDiff(agentId, path);

      // Store in cache
      cache.set(cacheKey, { diff, timestamp: now, contextLines: requestedContextLines });
      return diff;
    } catch (err) {
      console.error("Failed to load diff:", err);
      return null;
    }
  }, [agentId]);

  // Pre-fetch adjacent files for faster switching
  const prefetchAdjacentDiffs = useCallback((currentPath: string, fileList: FileChange[]) => {
    const currentIndex = fileList.findIndex(f => f.path === currentPath);
    if (currentIndex === -1) return;

    // Prefetch next and previous files (if not already cached)
    const adjacentIndices = [currentIndex - 1, currentIndex + 1];
    for (const idx of adjacentIndices) {
      if (idx >= 0 && idx < fileList.length) {
        const adjacentFile = fileList[idx];
        if (adjacentFile.status !== 'deleted') {
          const cacheKey = `${adjacentFile.path}:3`;
          const cached = diffCacheRef.current.get(cacheKey);
          if (!cached || (Date.now() - cached.timestamp) >= CACHE_TTL) {
            // Fire and forget - don't await
            getDiffForFile(adjacentFile.path, 3).catch(() => {});
          }
        }
      }
    }
  }, [getDiffForFile]);

  // Core file selection logic - shared between handleSelectFile and loadChanges
  const selectFileAndLoadDiff = useCallback(async (path: string, fileList: FileChange[]) => {
    // Immediately update selection for responsive UI
    setSelectedFile(path);
    setContextLines(3);
    setActiveCommentLine(null);

    // Check cache first for instant display
    const cacheKey = `${path}:3`;
    const cached = diffCacheRef.current.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      setFileDiff(cached.diff);
      prefetchAdjacentDiffs(path, fileList);
      return;
    }

    // Show loading state only if not cached
    setLoadingDiff(true);

    try {
      const diff = await getDiffForFile(path, 3);
      setFileDiff(diff);
      prefetchAdjacentDiffs(path, fileList);
    } catch (err) {
      console.error("Failed to load diff:", err);
      setFileDiff(null);
    } finally {
      setLoadingDiff(false);
    }
  }, [getDiffForFile, prefetchAdjacentDiffs]);

  const loadChanges = useCallback(async (invalidateCache = false) => {
    try {
      setLoading(true);
      setError(null);

      // Invalidate cache if requested (e.g., manual refresh)
      if (invalidateCache) {
        diffCacheRef.current.clear();
      }

      const changedFiles = await getAgentChanges(agentId);
      setFiles(changedFiles);

      // Refresh git stats in the background (updates sidebar display)
      refreshAgentGitStats(agentId).catch(console.error);

      if (changedFiles.length > 0 && !selectedFile) {
        selectFileAndLoadDiff(changedFiles[0].path, changedFiles);
      } else if (selectedFile) {
        const fileStillExists = changedFiles.some(f => f.path === selectedFile);
        if (fileStillExists) {
          // Refresh current file's diff (cache will be used if valid)
          const diff = await getDiffForFile(selectedFile, contextLines);
          setFileDiff(diff);
        } else {
          if (changedFiles.length > 0) {
            selectFileAndLoadDiff(changedFiles[0].path, changedFiles);
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
  }, [agentId, selectedFile, contextLines, selectFileAndLoadDiff, getDiffForFile]);

  useEffect(() => {
    loadChanges();
    const interval = setInterval(() => loadChanges(false), 10000);
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

  // Public file selection handler - delegates to the shared logic
  const handleSelectFile = useCallback((path: string) => {
    selectFileAndLoadDiff(path, files);
  }, [selectFileAndLoadDiff, files]);

  const handleLoadMoreContext = useCallback(async () => {
    if (!selectedFile || loadingContext) return;

    setLoadingContext(true);
    const newContextLines = contextLines + 10;
    try {
      const diff = await getDiffForFile(selectedFile, newContextLines);
      if (diff) {
        setFileDiff(diff);
        setContextLines(newContextLines);
      }
    } catch (err) {
      console.error("Failed to load more context:", err);
    } finally {
      setLoadingContext(false);
    }
  }, [selectedFile, contextLines, loadingContext, getDiffForFile]);

  const handleRevert = async () => {
    if (!selectedFile) return;
    const confirmed = window.confirm(`Revert all changes to ${selectedFile}?`);
    if (!confirmed) return;
    try {
      await revertFileChanges(agentId, selectedFile);
      // Clear cache for this file since it was reverted
      for (const key of diffCacheRef.current.keys()) {
        if (key.startsWith(`${selectedFile}:`)) {
          diffCacheRef.current.delete(key);
        }
      }
      await loadChanges(true);
    } catch (err) {
      console.error("Failed to revert:", err);
    }
  };

  // Manual refresh handler that invalidates cache
  const handleManualRefresh = useCallback(() => {
    loadChanges(true);
  }, [loadChanges]);

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
          onClick={handleManualRefresh}
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
              onClick={handleManualRefresh}
              title="Refresh"
            >
              <RefreshCw size={14} strokeWidth={1.5} />
            </Button>
          </div>
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-auto relative">
          {loadingDiff && (
            <div
              className="absolute inset-0 flex items-center justify-center text-xs z-10"
              style={{ backgroundColor: 'var(--bg-primary)', opacity: 0.8 }}
            >
              <span style={{ color: 'var(--text-dim)' }}>Loading diff...</span>
            </div>
          )}
          {fileDiff ? (
            <SimpleDiffViewer
              diff={fileDiff.diff}
              fileName={fileDiff.path}
              onExpandContext={handleLoadMoreContext}
              loadingContext={loadingContext}
              comments={fileComments}
              onAddComment={handleAddComment}
              activeCommentLine={activeCommentLine}
              onSetActiveCommentLine={setActiveCommentLine}
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

        {/* Review actions bar in fullscreen */}
        <ReviewActionsBar
          comments={comments}
          onSendAll={handleSendAllComments}
          onViewComments={() => setShowCommentsPopover(!showCommentsPopover)}
          showCommentsPopover={showCommentsPopover}
          onRemoveComment={handleRemoveComment}
          onClosePopover={() => setShowCommentsPopover(false)}
        />
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
            onClick={handleManualRefresh}
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
      <div className="flex-1 overflow-auto min-h-0 relative">
        {loadingDiff && (
          <div
            className="absolute inset-0 flex items-center justify-center text-xs z-10"
            style={{ backgroundColor: 'var(--bg-primary)', opacity: 0.8 }}
          >
            <span style={{ color: 'var(--text-dim)' }}>Loading diff...</span>
          </div>
        )}
        {fileDiff ? (
          <SimpleDiffViewer
            diff={fileDiff.diff}
            fileName={fileDiff.path}
            onExpandContext={handleLoadMoreContext}
            loadingContext={loadingContext}
            comments={fileComments}
            onAddComment={handleAddComment}
            activeCommentLine={activeCommentLine}
            onSetActiveCommentLine={setActiveCommentLine}
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

      {/* Review actions bar - shown when there are pending comments */}
      <ReviewActionsBar
        comments={comments}
        onSendAll={handleSendAllComments}
        onViewComments={() => setShowCommentsPopover(!showCommentsPopover)}
        showCommentsPopover={showCommentsPopover}
        onRemoveComment={handleRemoveComment}
        onClosePopover={() => setShowCommentsPopover(false)}
      />
    </div>
  );
}
