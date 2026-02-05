import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/agent";
import { Folder, RefreshCcw } from "lucide-react";

interface StatusBannersProps {
  agent: Agent;
  onRetry: () => void;
}

export function StatusBanners({ agent, onRetry }: StatusBannersProps) {

  if (agent.status === "manual_control") {
    return (
      <StatusBanner className="bg-popover">
        <div className="flex items-center gap-2">
          <Folder size={16} />
          <span>Agent is checked out locally.</span>
        </div>
      </StatusBanner>
    );
  }

  if (agent.status === "interrupted") {
    return (
      <StatusBanner className="bg-popover">
        <div>
          <p className="font-semibold text-warning mb-1">Interrupted</p>
          <div>Send a follow-up message to continue.</div>
        </div>
      </StatusBanner>
    );
  }

  if (agent.status === "error") {
    return (
      <StatusBanner className="bg-popover">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-destructive mb-1">Error</p>
            <div>An error occurred while running the agent. Please try again.</div>
          </div>
          <Button variant="outline" size="icon" onClick={onRetry}>
            <RefreshCcw size={16} />
          </Button>
        </div>
      </StatusBanner>
    );
  }

}

function StatusBanner({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <div className={cn("absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full max-w-[95%] w-full border border-border border-b-0 rounded-tl-2xl rounded-tr-2xl p-3 text-sm", className)}>
      {children}
    </div>
  );
}
