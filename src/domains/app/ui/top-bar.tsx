import { WorkspaceSelector } from "./workspace-selector";
import type { Workspace } from "../../../types/agent";
import Logo from "@/domains/assets/logo.svg?react";
import { SidebarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";


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
  return (

    <header
      data-tauri-drag-region
      className="flex items-center justify-between h-[48px] px-[80px] pr-[16px] bg-surface border-b border-border"
    >
      <div className="flex items-center gap-3">
        <Logo className="h-5 w-auto" />
        <Button variant="ghost" size="icon" title="Toggle sidebar" onClick={onToggleSidebar}>
          <SidebarIcon strokeWidth={1.5} />
        </Button>
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
