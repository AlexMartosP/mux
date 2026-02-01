import { ChevronDown, Settings, User } from "lucide-react";
import type { Workspace } from "../types/agent";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WorkspaceSelectorProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string | null) => void;
  onOpenSettings: () => void;
  onOpenWorkspaceSettings: () => void;
}

export function WorkspaceSelector({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onOpenSettings,
  onOpenWorkspaceSettings,
}: WorkspaceSelectorProps) {
  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);
  const displayName = selectedWorkspace?.name || "All Workspaces";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="w-full flex items-center justify-between px-3 py-2 text-xs transition-colors rounded-sm cursor-pointer"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          color: "var(--text-primary)",
        }}
      >
        <span className="truncate">{displayName}</span>
        <ChevronDown
          size={14}
          className="transition-transform duration-150 data-[state=open]:rotate-180"
          style={{ color: "var(--text-dim)" }}
        />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={4}
        className="min-w-[var(--anchor-width)]"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        {/* All Workspaces option */}
        <DropdownMenuItem
          onClick={() => onSelectWorkspace(null)}
          className="text-xs"
          style={{
            backgroundColor: selectedWorkspaceId === null ? "var(--bg-accent-subtle)" : undefined,
          }}
        >
          All Workspaces
        </DropdownMenuItem>

        {workspaces.length > 0 && <DropdownMenuSeparator />}

        {/* Workspace list */}
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            key={workspace.id}
            onClick={() => onSelectWorkspace(workspace.id)}
            className="text-xs"
            style={{
              backgroundColor:
                selectedWorkspaceId === workspace.id ? "var(--bg-accent-subtle)" : undefined,
            }}
          >
            <span className="truncate flex-1">{workspace.name}</span>
            {workspace.is_default && (
              <span
                className="text-[10px] px-1 ml-2"
                style={{
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-dim)",
                }}
              >
                default
              </span>
            )}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        {/* Workspace Settings */}
        <DropdownMenuItem onClick={onOpenWorkspaceSettings} className="text-xs gap-2">
          <Settings size={12} />
          <span>Workspace Settings</span>
        </DropdownMenuItem>

        {/* User Settings */}
        <DropdownMenuItem onClick={onOpenSettings} className="text-xs gap-2">
          <User size={12} />
          <span>User Settings</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
