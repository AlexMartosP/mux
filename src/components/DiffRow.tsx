import { memo } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DiffLineType } from "@/types/agent";

interface DiffRowProps {
  lineType: DiffLineType | "hunk-header";
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
  highlightedCode: React.ReactNode;
  canComment: boolean;
  hasComment: boolean;
  onClickGutter?: () => void;
}

export const DiffRow = memo(
  function DiffRow({
    lineType,
    oldLineNum,
    newLineNum,
    highlightedCode,
    canComment,
    hasComment,
    onClickGutter,
  }: DiffRowProps) {
    // Determine display line number (new for additions, old for deletions, either for context)
    const displayLineNum = lineType === "delete" ? oldLineNum : newLineNum;

    // Styling with Tailwind classes
    const rowBgClass =
      lineType === "add"
        ? "bg-success/10"
        : lineType === "delete"
          ? "bg-destructive/10"
          : lineType === "hunk-header"
            ? "bg-muted/30"
            : "transparent";

    const gutterBgClass =
      lineType === "add"
        ? "bg-success/15"
        : lineType === "delete"
          ? "bg-destructive/15"
          : lineType === "hunk-header"
            ? "bg-muted/50"
            : "bg-card";

    const lineNumColorClass =
      lineType === "add"
        ? "text-success"
        : lineType === "delete"
          ? "text-destructive"
          : "text-muted-foreground";

    const contentColorClass =
      lineType === "hunk-header"
        ? "text-muted-foreground font-medium"
        : "text-foreground";

    return (
      <div className={cn("grid grid-cols-[50px_1fr] min-h-[24px]", rowBgClass)}>
        <div
          className={cn(
            "select-none text-right px-2 border-r border-border text-xs",
            gutterBgClass,
            lineNumColorClass,
            canComment && "cursor-pointer hover:bg-primary/10 group"
          )}
          onClick={canComment ? onClickGutter : undefined}
        >
          {displayLineNum}
          {canComment && !hasComment && (
            <Plus
              size={12}
              strokeWidth={2}
              className="inline-block ml-1 opacity-0 group-hover:opacity-100 transition-opacity text-primary"
            />
          )}
        </div>
        <div
          className={cn(
            "px-3 py-0.5 whitespace-pre-wrap break-all font-mono text-xs",
            contentColorClass
          )}
        >
          {highlightedCode}
        </div>
      </div>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison for optimal re-renders
    // Only re-render if these specific props change
    return (
      prevProps.lineType === nextProps.lineType &&
      prevProps.content === nextProps.content &&
      prevProps.oldLineNum === nextProps.oldLineNum &&
      prevProps.newLineNum === nextProps.newLineNum &&
      prevProps.canComment === nextProps.canComment &&
      prevProps.hasComment === nextProps.hasComment &&
      prevProps.highlightedCode === nextProps.highlightedCode
    );
  }
);
