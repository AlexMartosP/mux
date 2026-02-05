import { DiffView, DiffModeEnum } from "@git-diff-view/react";
import type { StructuredFileDiff } from "@/types/agent";
import "@git-diff-view/react/styles/diff-view-pure.css";


interface GitDiffViewerProps {
  diff: StructuredFileDiff;
  fileName?: string;
}

export function GitDiffViewer({ diff, fileName }: GitDiffViewerProps) {
  // Handle binary files
  if (diff.is_binary) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Binary file
      </div>
    );
  }

  // Handle empty diffs
  if (diff.hunks.length === 0) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        No changes
      </div>
    );
  }

  // Build proper git diff format with headers + hunks
  const hunks = diff.hunks.map(hunk => {
    // Each hunk should include file headers for proper parsing
    return `${diff.old_file_header}\n${diff.new_file_header}\n${hunk.raw_content}`;
  });


  return (
    <div className="h-full">
      <DiffView
        data={{
          oldFile: {
            fileName: fileName || diff.path,
            content: null,
          },
          newFile: {
            fileName: fileName || diff.path,
            content: null,
          },
          hunks,
        }}
        diffViewMode={DiffModeEnum.Unified}
        diffViewTheme="dark"
        diffViewHighlight
        diffViewFontSize={12}
      />
    </div>
  );
}
