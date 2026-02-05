import { useState } from "react";
import { Settings, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import * as tauri from "@/domains/tauri/commands";
import { workspaceKeys } from "@/domains/workspaces/data/workspaces-keys";
import type { WorkspaceRepository } from "@/types/agent";

interface Props {
  workspaceId: string;
  repository: WorkspaceRepository;
}

export function RepositoryCard({ workspaceId, repository }: Props) {
  const queryClient = useQueryClient();

  // Local state for script editing
  const [isEditingScripts, setIsEditingScripts] = useState(false);
  const [editSetupScript, setEditSetupScript] = useState(repository.setup_script || "");
  const [editTeardownScript, setEditTeardownScript] = useState(repository.teardown_script || "");

  // Mutations
  const removeRepositoryMutation = useMutation({
    mutationFn: () =>
      tauri.removeRepositoryFromWorkspace(workspaceId, repository.repository_path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.repositories(workspaceId) });
    },
  });

  const updateScriptsMutation = useMutation({
    mutationFn: ({ setupScript, teardownScript }: { setupScript?: string; teardownScript?: string }) =>
      tauri.updateRepositoryScripts(workspaceId, repository.repository_path, setupScript, teardownScript),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.repositories(workspaceId) });
      setIsEditingScripts(false);
    },
  });

  const handleSaveScripts = () => {
    updateScriptsMutation.mutate({
      setupScript: editSetupScript.trim() || undefined,
      teardownScript: editTeardownScript.trim() || undefined,
    });
  };

  const handleCancelEditing = () => {
    setEditSetupScript(repository.setup_script || "");
    setEditTeardownScript(repository.teardown_script || "");
    setIsEditingScripts(false);
  };

  const hasScripts = repository.setup_script || repository.teardown_script;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {repository.name}
            </span>
            {hasScripts && (
              <span className="text-xs px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                scripts
              </span>
            )}
          </div>
          <p
            className="text-xs text-muted-foreground truncate"
            title={repository.repository_path}
          >
            {repository.repository_path}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              isEditingScripts ? handleCancelEditing() : setIsEditingScripts(true)
            }
            className={isEditingScripts ? "text-primary" : ""}
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => removeRepositoryMutation.mutate()}
            disabled={removeRepositoryMutation.isPending}
            className="text-destructive hover:text-destructive"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Script editing panel */}
      {isEditingScripts && (
        <div className="px-3 pb-3 space-y-3 border-t border-border">
          <div className="pt-3">
            <label className="block text-xs text-muted-foreground mb-2">
              Setup Script{" "}
              <span className="italic">(runs when agent starts)</span>
            </label>
            <Textarea
              value={editSetupScript}
              onChange={(e) => setEditSetupScript(e.target.value)}
              placeholder="e.g., npm install"
              rows={2}
              className="font-mono text-xs resize-y"
            />
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-2">
              Teardown Script{" "}
              <span className="italic">(runs when agent is deleted)</span>
            </label>
            <Textarea
              value={editTeardownScript}
              onChange={(e) => setEditTeardownScript(e.target.value)}
              placeholder="e.g., docker-compose down"
              rows={2}
              className="font-mono text-xs resize-y"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancelEditing}
              disabled={updateScriptsMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveScripts}
              disabled={updateScriptsMutation.isPending}
            >
              {updateScriptsMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
