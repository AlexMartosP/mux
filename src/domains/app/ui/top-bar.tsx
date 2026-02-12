import { WorkspaceSelector } from "./workspace-selector";
import type { Workspace } from "../../../types/agent";
import Logo from "@/domains/assets/logo.svg?react";
import { SidebarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function TopNavBar({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onOpenSettings,
  onToggleSidebar,
}: {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string | null) => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
}) {
  const location = useLocation();
  const isAgentsView = location.pathname.startsWith("/agents");
  const isCodeReviewView = location.pathname.startsWith("/code-review");

  return (
    <header
      data-tauri-drag-region
      className="flex items-center justify-between h-[48px] px-[80px] pr-[16px] bg-card border-b border-border"
    >
      <div className="flex items-center gap-3">
        <Logo className="h-5 w-auto" />
        <Button variant="ghost" size="icon" title="Toggle sidebar" onClick={onToggleSidebar}>
          <SidebarIcon strokeWidth={1.5} />
        </Button>

        {/* Navigation Tabs */}
        <nav className="flex items-center gap-1 ml-4">
          <Link to="/agents">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "text-xs",
                isAgentsView
                  ? "text-primary border-b border-primary rounded-none"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Agents
            </Button>
          </Link>
          <Link to="/code-review">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "text-xs",
                isCodeReviewView
                  ? "text-primary border-b border-primary rounded-none"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Code Review
            </Button>
          </Link>
        </nav>
      </div>

      <div>
        <WorkspaceSelector
          workspaces={workspaces}
          selectedWorkspaceId={selectedWorkspaceId}
          onSelectWorkspace={onSelectWorkspace}
          onOpenSettings={onOpenSettings}
        />
      </div>
    </header>
  );
}
