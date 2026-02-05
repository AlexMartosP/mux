import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as tauri from "@/domains/tauri/commands";
import { workspaceKeys } from "@/domains/workspaces/data/workspaces-keys";

export const Route = createFileRoute("/settings/workspaces")({
  component: WorkspacesPage,
});

function WorkspacesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [branchPrefix, setBranchPrefix] = useState("");

  const createWorkspaceMutation = useMutation({
    mutationFn: async ({ name, branchPrefix }: { name: string; branchPrefix: string }) => {
      // Create workspace with empty repos_folder_path (legacy field)
      const workspace = await tauri.createWorkspace(name, "");

      // Save branch prefix if provided
      if (branchPrefix.trim()) {
        await tauri.setWorkspaceSetting(workspace.id, "branch_prefix", branchPrefix.trim());
      }

      return workspace;
    },
    onSuccess: (workspace) => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspace.id) });

      // Reset form
      setName("");
      setBranchPrefix("");

      // Navigate to the new workspace settings page
      navigate({ to: "/settings/workspace/$workspaceId", params: { workspaceId: workspace.id } });
    },
  });

  const handleCreate = () => {
    if (!name.trim()) return;

    createWorkspaceMutation.mutate({
      name: name.trim(),
      branchPrefix: branchPrefix.trim(),
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg font-medium text-foreground">Create Workspace</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Create a new workspace to organize your agents and repositories
        </p>
      </div>

      {/* Create Form */}
      <div className="p-4 bg-card border border-border rounded-lg space-y-4">
        <div>
          <label className="block text-xs text-muted-foreground mb-2">
            Name <span className="text-destructive">*</span>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Workspace"
            className="text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                handleCreate();
              }
            }}
          />
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-2">
            Branch Prefix (optional)
          </label>
          <Input
            value={branchPrefix}
            onChange={(e) => setBranchPrefix(e.target.value)}
            placeholder="e.g., john-doe"
            className="text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) {
                handleCreate();
              }
            }}
          />
          <p className="text-xs text-muted-foreground mt-1.5">
            A prefix to add to all branch names created in this workspace
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate({ to: "/settings/chat" })}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleCreate}
            disabled={!name.trim() || createWorkspaceMutation.isPending}
          >
            {createWorkspaceMutation.isPending ? "Creating..." : "Create Workspace"}
          </Button>
        </div>
      </div>

      {/* Info */}
      <div className="p-4 bg-muted/50 border border-border rounded-lg">
        <p className="text-xs text-muted-foreground">
          After creating a workspace, you'll be able to add repositories to it. Agents can then be
          spawned using repositories from this workspace.
        </p>
      </div>
    </div>
  );
}
