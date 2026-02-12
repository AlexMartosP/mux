import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilePlus, FileEdit, FileX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { GitDiffViewer } from "@/domains/code-review/ui/git-diff-viewer";
import { getAgentFileChanges, getAgentFileDiffData } from "@/domains/tauri/commands";
import { agentKeys } from "@/domains/agents/data/agents-keys";
import type { FileChange, FileStatus } from "@/types/agent";
import { FileTree } from "@/domains/code-review/ui/file-tree";

interface AgentChangesCompactProps {
  agentId: string;
}



// Get status icon for file
function getStatusIcon(status: FileStatus) {
  switch (status) {
    case "added":
      return <FilePlus size={14} strokeWidth={1.5} className="text-success shrink-0" />;
    case "deleted":
      return <FileX size={14} strokeWidth={1.5} className="text-destructive shrink-0" />;
    default:
      return <FileEdit size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />;
  }
}

// Query hook for individual file diff - query then listen pattern
function useFileDiffQuery(agentId: string, filePath: string, enabled: boolean) {
  return useQuery({
    queryKey: [...agentKeys.changes(agentId), 'diff', filePath],
    queryFn: async () => {
      const result = await getAgentFileDiffData(agentId, filePath);
      return result;
    },
    staleTime: 0, // No caching - always fresh
    enabled, // Only load when enabled (e.g., when expanded)
  });
}

// File diff card component
function FileDiffCard({
  agentId,
  file,
}: {
  agentId: string;
  file: FileChange;
}) {
  const fileName = file.path.split("/").pop() || file.path;

  const { data: diff, isPending } = useFileDiffQuery(agentId, file.path, true);

  if (isPending) {
    return null
  }

  return (
    <div
      className="border border-border rounded-lg overflow-hidden bg-card"
    >
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
        </div>
      </div>

      {file.status !== "deleted" && diff && (
        <GitDiffViewer
          diff={diff}
          fileName={file.path}
        />
      )}

    </div>
  );
}

// Query hook for file changes
function useFileChangesQuery(agentId: string) {
  return useQuery({
    queryKey: agentKeys.fileChanges(agentId),
    queryFn: async () => {
      console.timeLog("AgentChangesCompact render", "before getAgentFileChanges");
      const result = await getAgentFileChanges(agentId, false);
      console.timeLog("AgentChangesCompact render", "after getAgentFileChanges");
      return result;
    },
    staleTime: 0, // No caching - always fresh (query-then-listen pattern)
  });
}

export function AgentChangesCompact({
  agentId,
}: AgentChangesCompactProps) {
  const { data: files = [], isPending, error } = useFileChangesQuery(agentId);

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Skeleton className="h-20 w-full max-w-md" />
        <Skeleton className="h-20 w-full max-w-md" />
        <Skeleton className="h-20 w-full max-w-md" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <span className="text-sm">Failed to load file changes</span>
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
      <div className="flex-1 overflow-auto min-w-0 p-4 space-y-4">
        {files.map((file) => {
          return (
            <FileDiffCard
              key={file.path}
              agentId={agentId}
              file={file}
            />
          );
        })}
      </div>

      <div className="w-64 border-l border-border overflow-auto shrink-0">
        <div className="p-2">
          <FileTree files={files} onSelectFile={() => { }} selectedFilePath={null} autoExpandAll={true} />
        </div>
      </div>
    </div>
  );
}
