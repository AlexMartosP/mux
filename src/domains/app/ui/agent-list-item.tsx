import type { Agent, CIStatus } from "../../../types/agent";
import { useCallback } from "react";
import { cn } from "@/lib/utils";
import { DotSpinner } from "@/components/dot-spinner";
import { SlidingText } from "@/components/sliding-text";
import { Skeleton } from "@/components/ui/skeleton";
import { ContextMenu, ContextMenuItem, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";



export function AgentListItem({
  agent,
  isSelected,
  onSelect,
  onArchive,
}: {
  agent: Agent;
  isSelected: boolean;
  ciStatus?: CIStatus;
  onSelect: (agentId: string) => void;
  onArchive: (agentId: string) => void;
}) {
  const isRunning = agent.status === "running";

  const handleClick = useCallback(() => {
    onSelect(agent.id);
  }, [onSelect, agent.id]);


  return (
    <ContextMenu>
      <ContextMenuTrigger className={cn("relative group mx-1 px-2 py-2 my-1 flex items-center gap-2 transition-colors cursor-pointer before:content-[''] before:absolute before:inset-0 before:rounded-md before:transition-all before:duration-100 before:z-[-1]", isSelected ? "before:bg-muted" : "before:bg-transparent hover:before:bg-muted")} onClick={handleClick}>
        {isRunning && (
          <span className="shrink-0">
            <DotSpinner />
          </span>
        )}

        <div className="flex-1 overflow-hidden min-w-0">
          <div className="flex items-center justify-between gap-1">
            <div className="flex-1 overflow-hidden min-w-0">
              {!agent.metadata_loading ? (
                <SlidingText
                  text={agent.name}
                  className={cn("text-sm", isSelected ? "text-foreground" : "text-muted-foreground")}
                />
              ) : (
                <Skeleton
                  className="w-[24ch] h-4"
                />
              )}
            </div>
            <div className="shrink-0">
              {(agent.total_additions || agent.total_deletions) ? (
                <span className="text-xs">
                  <span className="text-success">
                    +{agent.total_additions || 0}
                  </span>
                  <span> </span>
                  <span className="text-destructive">
                    -{agent.total_deletions || 0}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
          <div className="overflow-hidden">
            {!agent.metadata_loading ? (
              <SlidingText
                text={agent.branch}
                className="text-xs text-muted-foreground"
              />
            ) : (
              <Skeleton
                className="w-[12ch] h-4"
              />
            )}
          </div>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={() => onArchive(agent.id)} className="text-destructive">Archive</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>

  );
}
