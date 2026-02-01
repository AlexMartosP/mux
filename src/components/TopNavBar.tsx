import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceSelector } from "./WorkspaceSelector";
import type { Workspace } from "../types/agent";
import Logo from "../assets/logo.svg?react";

interface TopNavBarProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string | null) => void;
  onOpenSettings: () => void;
  onOpenWorkspaceSettings: () => void;
}

export function TopNavBar({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onOpenSettings,
  onOpenWorkspaceSettings,
}: TopNavBarProps) {
  return (
    <header
      data-tauri-drag-region
      className="flex items-center justify-between"
      style={{
        height: "48px",
        paddingLeft: "80px", // Space for macOS traffic lights
        paddingRight: "16px",
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-default)",
      }}
    >
      {/* Left: Logo */}
      <div className="flex items-center gap-6">
        <Logo className="h-5 w-auto" />
      </div>

      {/* Right: Workspace selector and settings */}
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        <div className="w-[180px]">
          <WorkspaceSelector
            workspaces={workspaces}
            selectedWorkspaceId={selectedWorkspaceId}
            onSelectWorkspace={onSelectWorkspace}
            onOpenSettings={onOpenSettings}
            onOpenWorkspaceSettings={onOpenWorkspaceSettings}
          />
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          title="Settings (Cmd+,)"
        >
          <Settings size={16} strokeWidth={1.5} />
        </Button>
      </div>
    </header>
  );
}
