import { useState, useEffect, useCallback, useRef, useMemo, createRef } from "react";
import { FilePlus, FileEdit, FileX, Folder, ChevronRight, ChevronDown, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { GitDiffViewer } from "@/components/GitDiffViewer";
import { ReviewActionsBar, type ReviewComment } from "@/components/ReviewComment";
import { cn } from "@/lib/utils";
import { getAgentChangesFiltered, getStructuredFileDiff, refreshAgentGitStats } from "@/domains/tauri/commands";
import type { FileChange, StructuredFileDiff } from "@/types/agent";

interface AgentChangesCompactProps {
  agentId: string;
}

// Cache for diffs
interface DiffCache {
  [key: string]: {
    diff: StructuredFileDiff;
    timestamp: number;
  };
}

const CACHE_TTL = 30000; // 30 seconds

// Tree node structure
interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  file?: FileChange;
}

// Build tree from flat file list
function buildFileTree(files: FileChange[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split("/");
    let currentLevel = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const currentPath = parts.slice(0, i + 1).join("/");

      let existing = currentLevel.find((n) => n.name === part);

      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          isFolder: !isFile,
          children: [],
          file: isFile ? file : undefined,
        };
        currentLevel.push(existing);
      }

      if (!isFile) {
        currentLevel = existing.children;
      }
    }
  }

  // Sort: folders first, then files, alphabetically
  const sortNodes = (nodes: TreeNode[]): TreeNode[] => {
    return nodes
      .map((n) => ({ ...n, children: sortNodes(n.children) }))
      .sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name);
      });
  };

  return sortNodes(root);
}

// Get status icon for file
function getStatusIcon(status: string) {
  switch (status) {
    case "added":
      return <FilePlus size={14} strokeWidth={1.5} className="text-success shrink-0" />;
    case "deleted":
      return <FileX size={14} strokeWidth={1.5} className="text-destructive shrink-0" />;
    default:
      return <FileEdit size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />;
  }
}

// File diff card component
function FileDiffCard({
  file,
  diff,
  isLoading,
  isExpanded,
  onToggleExpand,
  cardRef,
}: {
  file: FileChange;
  diff: StructuredFileDiff | null;
  isLoading: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  cardRef: React.RefObject<HTMLDivElement | null>;
}) {
  const fileName = file.path.split("/").pop() || file.path;

  return (
    <div
      ref={cardRef}
      className="border border-border rounded-lg overflow-hidden bg-card"
    >
      {/* Card header */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2 min-w-0">
          {getStatusIcon(file.status)}
          <span className="text-sm font-medium truncate" title={file.path}>
            {fileName}
          </span>
          <span className="text-xs text-muted-foreground truncate hidden sm:block">
            {file.path !== fileName && file.path.slice(0, -fileName.length - 1)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(file.additions > 0 || file.deletions > 0) && (
            <span className="flex items-center gap-1.5 text-xs">
              {file.additions > 0 && (
                <span className="text-success">+{file.additions}</span>
              )}
              {file.deletions > 0 && (
                <span className="text-destructive">-{file.deletions}</span>
              )}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggleExpand}
            title={isExpanded ? "Collapse" : "Expand"}
            className="text-muted-foreground hover:text-foreground"
          >
            <ChevronsUpDown size={14} />
          </Button>
        </div>
      </div>

      {/* Diff content */}
      <div className={isExpanded ? "overflow-auto" : "max-h-[300px] overflow-auto"}>
        {isLoading ? (
          <div className="p-4">
            <Skeleton className="h-20 w-full" />
          </div>
        ) : diff ? (
          <GitDiffViewer
            diff={diff}
            fileName={diff.path}
          />
        ) : file.status === "deleted" ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            File deleted
          </div>
        ) : (
          <div className="p-4 text-sm text-muted-foreground text-center">
            Unable to load diff
          </div>
        )}
      </div>
    </div>
  );
}

// File tree item component
function FileTreeItem({
  node,
  depth,
  highlightedFile,
  expandedFolders,
  onSelectFile,
  onToggleFolder,
}: {
  node: TreeNode;
  depth: number;
  highlightedFile: string | null;
  expandedFolders: Set<string>;
  onSelectFile: (path: string) => void;
  onToggleFolder: (path: string) => void;
}) {
  const isExpanded = expandedFolders.has(node.path);
  const isHighlighted = highlightedFile === node.path;

  if (node.isFolder) {
    return (
      <div>
        <button
          onClick={() => onToggleFolder(node.path)}
          className="w-full text-left px-2 py-1.5 text-sm flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors rounded"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isExpanded ? (
            <ChevronDown size={14} strokeWidth={1.5} className="shrink-0" />
          ) : (
            <ChevronRight size={14} strokeWidth={1.5} className="shrink-0" />
          )}
          <Folder size={14} strokeWidth={1.5} className="shrink-0 text-muted-foreground" />
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && (
          <div>
            {node.children.map((child) => (
              <FileTreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                highlightedFile={highlightedFile}
                expandedFolders={expandedFolders}
                onSelectFile={onSelectFile}
                onToggleFolder={onToggleFolder}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={cn(
        "w-full text-left px-2 py-1.5 text-sm flex items-center gap-2 transition-colors rounded",
        isHighlighted
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      )}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      title={node.path}
    >
      {getStatusIcon(node.file?.status || "modified")}
      <span className="truncate">{node.name}</span>
      {node.file && (node.file.additions > 0 || node.file.deletions > 0) && (
        <span className="ml-auto flex items-center gap-1 shrink-0 text-[10px]">
          {node.file.additions > 0 && (
            <span className="text-success">+{node.file.additions}</span>
          )}
          {node.file.deletions > 0 && (
            <span className="text-destructive">-{node.file.deletions}</span>
          )}
        </span>
      )}
    </button>
  );
}

export function AgentChangesCompact({
  agentId,
}: AgentChangesCompactProps) {
  const [files, setFiles] = useState<FileChange[]>([]);
  const [diffs, setDiffs] = useState<Record<string, StructuredFileDiff | null>>({});
  const [loadingDiffs, setLoadingDiffs] = useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [highlightedFile, setHighlightedFile] = useState<string | null>(null);

  // Comment system
  const [comments, setComments] = useState<ReviewComment[]>([]);
  const [_activeCommentLine, _setActiveCommentLine] = useState<number | null>(null);
  const [showCommentsPopover, setShowCommentsPopover] = useState(false);

  const diffCacheRef = useRef<DiffCache>({});
  const currentAgentRef = useRef<string>(agentId);
  const cardRefsRef = useRef<Record<string, React.RefObject<HTMLDivElement | null>>>({});
  const cardsContainerRef = useRef<HTMLDivElement>(null);

  // Build file tree from flat list
  const fileTree = useMemo(() => buildFileTree(files), [files]);

  // Sort files to match tree order (alphabetically by path segments)
  const sortedFiles = useMemo(() => {
    return [...files].sort((a, b) => {
      const partsA = a.path.split("/");
      const partsB = b.path.split("/");

      // Compare each path segment
      for (let i = 0; i < Math.min(partsA.length, partsB.length); i++) {
        const cmp = partsA[i].localeCompare(partsB[i]);
        if (cmp !== 0) return cmp;
      }

      // Shorter paths (folders) come first
      return partsA.length - partsB.length;
    });
  }, [files]);

  // Ensure we have refs for all files
  useEffect(() => {
    for (const file of files) {
      if (!cardRefsRef.current[file.path]) {
        cardRefsRef.current[file.path] = createRef<HTMLDivElement>();
      }
    }
  }, [files]);

  // Clear cache when agent changes
  useEffect(() => {
    if (agentId !== currentAgentRef.current) {
      diffCacheRef.current = {};
      currentAgentRef.current = agentId;
      setDiffs({});
      setExpandedCards(new Set());
    }
  }, [agentId]);

  // Auto-expand folders containing files on first load
  useEffect(() => {
    if (files.length > 0 && expandedFolders.size === 0) {
      const foldersToExpand = new Set<string>();
      for (const file of files) {
        const parts = file.path.split("/");
        for (let i = 1; i < parts.length; i++) {
          foldersToExpand.add(parts.slice(0, i).join("/"));
        }
      }
      setExpandedFolders(foldersToExpand);
    }
  }, [files, expandedFolders.size]);

  const loadDiff = useCallback(async (path: string) => {
    const now = Date.now();
    const cached = diffCacheRef.current[path];

    if (cached && now - cached.timestamp < CACHE_TTL) {
      setDiffs(prev => ({ ...prev, [path]: cached.diff }));
      return;
    }

    setLoadingDiffs(prev => new Set(prev).add(path));
    try {
      const diff = await getStructuredFileDiff(agentId, path, { context_lines: 3, exclude_untracked: false });
      diffCacheRef.current[path] = { diff, timestamp: now };
      setDiffs(prev => ({ ...prev, [path]: diff }));
    } catch (err) {
      console.error(`Failed to load diff for ${path}:`, err);
      setDiffs(prev => ({ ...prev, [path]: null }));
    } finally {
      setLoadingDiffs(prev => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  }, [agentId]);

  const loadChanges = useCallback(async () => {
    try {
      setError(null);

      // Filter out untracked files
      const changedFiles = await getAgentChangesFiltered(agentId, true);
      setFiles(changedFiles);

      // Refresh git stats in the background
      refreshAgentGitStats(agentId).catch(console.error);

      // Preload diffs in background with staggered delays (non-blocking)
      setTimeout(() => {
        changedFiles.forEach((file, index) => {
          if (file.status !== 'deleted') {
            // Stagger each load by 50ms to avoid blocking
            setTimeout(() => loadDiff(file.path), index * 50);
          }
        });
      }, 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load changes");
    }
  }, [agentId, loadDiff]);

  useEffect(() => {
    loadChanges();
    const interval = setInterval(loadChanges, 10000);
    return () => clearInterval(interval);
  }, [loadChanges]);

  const handleSelectFile = (path: string) => {
    // Scroll to the card
    const cardRef = cardRefsRef.current[path];
    if (cardRef?.current && cardsContainerRef.current) {
      cardRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    // Highlight briefly
    setHighlightedFile(path);
    setTimeout(() => setHighlightedFile(null), 2000);
  };

  const handleToggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  // Comment handlers
  // @ts-ignore - unused but kept for future implementation
  const _handleAddComment = useCallback((lineNumber: number, content: string, _sendImmediately: boolean) => {
    // Note: AgentChangesCompact doesn't have onSendReview prop yet
    // For now, just store comments. Will add onSendReview prop later if needed.
    const newComment: ReviewComment = {
      id: crypto.randomUUID(),
      filePath: "", // Will be set by the caller
      lineNumber,
      content,
      timestamp: new Date().toISOString(),
    };
    setComments(prev => [...prev, newComment]);
    _setActiveCommentLine(null);
  }, [_setActiveCommentLine]);

  const handleSendAllComments = useCallback(() => {
    if (comments.length === 0) return;

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

    console.log("Review prompt:", prompt.trim());
    // TODO: Send to agent when onSendReview prop is added
    setComments([]);
    setShowCommentsPopover(false);
  }, [comments]);

  const handleRemoveComment = useCallback((id: string) => {
    setComments(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleToggleCardExpand = useCallback((path: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
        // Load diff when expanding (if not already loaded)
        if (!diffs[path] && !loadingDiffs.has(path)) {
          loadDiff(path);
        }
      }
      return next;
    });
  }, [diffs, loadingDiffs, loadDiff]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <span className="text-sm">{error}</span>
        <Button variant="ghost" size="sm" onClick={loadChanges}>
          Retry
        </Button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <span className="text-sm">No changes yet</span>
        <span className="text-xs mt-1">Changes will appear here as the agent works</span>
      </div>
    );
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Cards list */}
      <div ref={cardsContainerRef} className="flex-1 overflow-auto min-w-0 p-4 space-y-4">
        {sortedFiles.map((file) => {
          return (
            <FileDiffCard
              key={file.path}
              file={file}
              diff={diffs[file.path] || null}
              isLoading={loadingDiffs.has(file.path)}
              isExpanded={expandedCards.has(file.path)}
              onToggleExpand={() => handleToggleCardExpand(file.path)}
              cardRef={cardRefsRef.current[file.path] || { current: null }}
            />
          );
        })}
      </div>

      {/* File tree */}
      <div className="w-64 border-l border-border overflow-auto shrink-0">
        <div className="p-2">
          {fileTree.map((node) => (
            <FileTreeItem
              key={node.path}
              node={node}
              depth={0}
              highlightedFile={highlightedFile}
              expandedFolders={expandedFolders}
              onSelectFile={handleSelectFile}
              onToggleFolder={handleToggleFolder}
            />
          ))}
        </div>
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
