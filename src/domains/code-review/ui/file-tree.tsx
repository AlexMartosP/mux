import { cn } from "@/lib/utils";
import { FileChange, FileStatus } from "@/types/agent";
import { ChevronDown, ChevronRight, FilePlus, FileEdit, FileX, Folder } from "lucide-react";
import { useMemo, useState } from "react";

type TreeNode = {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
  file?: FileChange;
}

export function FileTree({ files, onSelectFile, selectedFilePath, autoExpandAll }: { files: FileChange[], onSelectFile: (filePath: string) => void, selectedFilePath: string | null | undefined, autoExpandAll?: boolean }) {

  const fileTree = useMemo(() => buildFileTree(files), [files]);

  return (
    <div>
      {fileTree.map((node) => (
        <FileTreeItem
          key={node.path}
          node={node}
          depth={0}
          selectedFilePath={selectedFilePath}
          initialExpanded={!!autoExpandAll}
          onSelectFile={(filePath) => {
            onSelectFile(filePath);
          }}
        />
      ))}
    </div>
  );
}

function FileTreeItem({
  node,
  depth,
  selectedFilePath,
  onSelectFile,
  initialExpanded,
}: {
  node: TreeNode;
  depth: number;
  selectedFilePath: string | null | undefined;
  onSelectFile: (filePath: string) => void;
  initialExpanded: boolean;
}) {

  const [isExpanded, setIsExpanded] = useState(initialExpanded);
  const isSelected = selectedFilePath === node.path || node.children.some((child) => child.path === selectedFilePath);

  if (node.isFolder) {
    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
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
                selectedFilePath={selectedFilePath}
                onSelectFile={onSelectFile}
                initialExpanded={initialExpanded}
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
        isSelected
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
