import { Button } from "@/components/ui/button";
import { DiffView, DiffModeEnum, DiffFile } from "@git-diff-view/react";
import "@git-diff-view/react/styles/diff-view.css";
import { useMemo, useState } from "react";

export type GitDiff = {
  is_binary: boolean,
  git_diff: string,
  old_file_content: string,
  new_file_content: string,
}

export type GitDiffViewerProps = {
  diff: GitDiff;
  fileName: string;
  onAddComment?: (lineNumber: number, content: string) => void;
}

export function GitDiffViewer({ diff, fileName, onAddComment }: GitDiffViewerProps) {
  const [isError, setIsError] = useState(false);

  if (diff.is_binary) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Binary file
      </div>
    );
  }

  const diffFile = useMemo(() => {
    try {
      const diffFile = DiffFile.createInstance({
        newFile: {
          fileName: fileName,
          content: diff.new_file_content,
        },
        oldFile: {
          fileName: fileName,
          content: diff.old_file_content,
        },
        hunks: [diff.git_diff],
      });

      diffFile.init()
      return diffFile;
    } catch (err) {
      setIsError(true);
      return null;
    }
  }, [diff.git_diff, diff.old_file_content, diff.new_file_content, fileName]);

  if (isError || !diffFile) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Error loading diff
      </div>
    );
  }

  return (
    <DiffView
      diffFile={diffFile}
      diffViewMode={DiffModeEnum.Unified}
      style={{
        // @ts-ignore
        "--diff-plain-content--": "var(--background)",
        "--diff-plain-lineNumber--": "var(--background)",
        "--diff-hunk-content--": "oklch(0.31 0.04 255.38)",
        "--diff-hunk-lineNumber--": "oklch(0.37 0.11 258)",
      }}
      diffViewTheme="dark"
      className="bg-background"
      diffViewHighlight
      diffViewFontSize={12}
      renderWidgetLine={({ lineNumber }) => {
        return (
          <div>
            <Button onClick={() => onAddComment?.(lineNumber, "New comment")}>Add Comment</Button>
          </div>
        );
      }}
    />
  );
}
