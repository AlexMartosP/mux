import { ChevronDown, User } from "lucide-react";
import type { Workspace } from "../../../types/agent";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";


export function WorkspaceSelector({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onOpenSettings,
}: {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string | null) => void;
  onOpenSettings: () => void;
}) {
  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);
  const displayName = selectedWorkspace?.name || "All Workspaces";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
      >
        <Button variant="secondary">
          <span className="truncate">{displayName}</span>
          <ChevronDown data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        sideOffset={4}
      >

        {workspaces.map((workspace) => (
          <DropdownMenuCheckboxItem
            key={workspace.id}
            checked={selectedWorkspaceId === workspace.id}
            onCheckedChange={(checked) => onSelectWorkspace(checked ? workspace.id : selectedWorkspaceId)}
          >
            <span className="truncate flex-1">{workspace.name}</span>
          </DropdownMenuCheckboxItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onOpenSettings} className="text-xs gap-2">
          <User size={12} />
          <span>Settings</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
