import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Folder, FolderSearch, X } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as tauri from "@/domains/tauri/commands";
import { workspaceKeys } from "@/domains/workspaces/data/workspaces-keys";
import type { RepositoryInfo } from "@/types/agent";
import { RepositoryCard } from "./_components/RepositoryCard";

export const Route = createFileRoute("/settings/workspace/$workspaceId")({
  component: WorkspaceSettings,
});

function WorkspaceSettings() {
  const { workspaceId } = Route.useParams();
  const navigate = useNavigate();

  // Queries
  const { data: workspace, isLoading: workspaceLoading } = useQuery({
    queryKey: workspaceKeys.detail(workspaceId),
    queryFn: () => tauri.getWorkspace(workspaceId),
  });

  const { data: workspaceSettings, isLoading: settingsLoading } = useQuery({
    queryKey: workspaceKeys.settings(workspaceId),
    queryFn: () => tauri.getAllWorkspaceSettings(workspaceId),
  });

  const { data: repositories = [], isLoading: reposLoading } = useQuery({
    queryKey: workspaceKeys.repositories(workspaceId),
    queryFn: () => tauri.getWorkspaceRepositories(workspaceId),
  });

  const isLoading = workspaceLoading || settingsLoading || reposLoading;

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-xs text-muted-foreground">Loading workspace...</p>
      </div>
    );
  }

  // Show not found state
  if (!workspace || !workspaceSettings) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-xs text-muted-foreground">Workspace not found</p>
        <Button variant="outline" onClick={() => navigate({ to: "/settings" })}>
          Back to settings
        </Button>
      </div>
    );
  }

  // Now workspace and workspaceSettings are guaranteed to exist
  return <WorkspaceSettingsContent
    workspace={workspace}
    workspaceSettings={workspaceSettings}
    repositories={repositories}
    workspaceId={workspaceId}
  />;
}

interface WorkspaceSettingsContentProps {
  workspace: NonNullable<Awaited<ReturnType<typeof tauri.getWorkspace>>>;
  workspaceSettings: Record<string, string>;
  repositories: Awaited<ReturnType<typeof tauri.getWorkspaceRepositories>>;
  workspaceId: string;
}

function WorkspaceSettingsContent({
  workspace,
  workspaceSettings,
  repositories,
  workspaceId
}: WorkspaceSettingsContentProps) {
  const queryClient = useQueryClient();

  // Workspace inline editing - initialized from props (guaranteed to exist)
  const [name, setName] = useState(workspace.name);
  const [branchPrefix, setBranchPrefix] = useState(workspaceSettings.branch_prefix || "");

  // Scan folder picker state
  const [showScanPicker, setShowScanPicker] = useState(false);
  const [scannedRepos, setScannedRepos] = useState<RepositoryInfo[]>([]);
  const [selectedScannedRepos, setSelectedScannedRepos] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);

  // Mutations
  const updateWorkspaceMutation = useMutation({
    mutationFn: async ({ name, branchPrefix }: { name: string; branchPrefix: string }) => {
      await tauri.updateWorkspace(workspaceId, name, workspace.repos_folder_path);
      if (branchPrefix.trim()) {
        await tauri.setWorkspaceSetting(workspaceId, "branch_prefix", branchPrefix.trim());
      } else {
        await tauri.deleteWorkspaceSetting(workspaceId, "branch_prefix");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.detail(workspaceId) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.settings(workspaceId) });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
    },
  });

  const addRepositoryMutation = useMutation({
    mutationFn: async ({ repoPath, name }: { repoPath: string; name: string }) => {
      await tauri.addRepositoryToWorkspace(workspaceId, repoPath, name);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.repositories(workspaceId) });
    },
  });

  // Handlers
  const handleSaveWorkspace = () => {
    updateWorkspaceMutation.mutate({
      name: name.trim(),
      branchPrefix: branchPrefix.trim(),
    });
  };

  const handleAddSingleRepo = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Repository",
      });
      if (selected) {
        const repoPath = selected as string;
        const repoName = repoPath.split("/").pop() || repoPath;
        await addRepositoryMutation.mutateAsync({ repoPath, name: repoName });
      }
    } catch (err) {
      console.error("Failed to add repository:", err);
    }
  };

  const handleScanFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Folder to Scan for Repositories",
      });
      if (selected) {
        setIsScanning(true);
        setShowScanPicker(true);
        const repos = await tauri.scanFolderForRepositories(selected as string);
        setScannedRepos(repos);
        setSelectedScannedRepos(new Set());
        setIsScanning(false);
      }
    } catch (err) {
      console.error("Failed to scan folder:", err);
      setIsScanning(false);
    }
  };

  const handleAddSelectedRepos = async () => {
    if (selectedScannedRepos.size === 0) return;

    try {
      for (const repoPath of selectedScannedRepos) {
        const repo = scannedRepos.find((r) => r.path === repoPath);
        if (repo) {
          await addRepositoryMutation.mutateAsync({ repoPath: repo.path, name: repo.name });
        }
      }
      setShowScanPicker(false);
      setScannedRepos([]);
      setSelectedScannedRepos(new Set());
    } catch (err) {
      console.error("Failed to add repositories:", err);
    }
  };

  const toggleRepoSelection = (path: string) => {
    setSelectedScannedRepos((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-medium text-foreground">Workspace Settings</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Configure workspace settings and manage repositories
          </p>
        </div>
      </div>

      {/* Workspace Details Form */}
      <section className="space-y-4">
        <h2 className="text-xs font-medium text-foreground">WORKSPACE DETAILS</h2>

        <div className="p-4 bg-card border border-border rounded-lg space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-2">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workspace name"
              className="text-sm"
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
            />
          </div>

          <div className="flex justify-end">
            <Button
              variant="default"
              size="sm"
              onClick={handleSaveWorkspace}
              disabled={updateWorkspaceMutation.isPending}
            >
              {updateWorkspaceMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      </section>

      {/* Repositories Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium text-foreground">REPOSITORIES</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddSingleRepo}
              className="text-xs"
            >
              <Folder className="w-3 h-3 mr-1.5" />
              Add Repository
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleScanFolder}
              className="text-xs"
            >
              <FolderSearch className="w-3 h-3 mr-1.5" />
              Scan Folder
            </Button>
          </div>
        </div>

        {repositories.length === 0 ? (
          <div className="p-8 text-center bg-card border border-border rounded-lg">
            <p className="text-xs text-muted-foreground">
              No repositories added yet. Add repositories to use them with agents in this workspace.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {repositories.map((repo) => (
              <RepositoryCard
                key={repo.repository_path}
                workspaceId={workspaceId}
                repository={repo}
              />
            ))}
          </div>
        )}

        {/* Scan folder picker modal */}
        {showScanPicker && (
          <div className="p-4 bg-popover border border-primary rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-foreground">
                Select repositories to add
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setShowScanPicker(false);
                  setScannedRepos([]);
                  setSelectedScannedRepos(new Set());
                }}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {isScanning ? (
              <div className="text-xs py-8 text-center text-muted-foreground">
                Scanning for repositories...
              </div>
            ) : scannedRepos.length === 0 ? (
              <div className="text-xs py-8 text-center text-muted-foreground">
                No git repositories found in the selected folder.
              </div>
            ) : (
              <>
                <div className="max-h-64 overflow-auto space-y-2 mb-3">
                  {scannedRepos.map((repo) => {
                    const isSelected = selectedScannedRepos.has(repo.path);
                    const isAlreadyAdded = repositories.some(
                      (r) => r.repository_path === repo.path
                    );

                    return (
                      <label
                        key={repo.path}
                        className={`flex items-center gap-3 p-2 cursor-pointer border rounded transition-colors ${
                          isSelected
                            ? "bg-primary/10 border-primary"
                            : "bg-card border-border hover:border-input"
                        } ${isAlreadyAdded ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => !isAlreadyAdded && toggleRepoSelection(repo.path)}
                          disabled={isAlreadyAdded}
                          className="accent-primary"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-foreground truncate">
                            {repo.name}
                            {isAlreadyAdded && (
                              <span className="text-muted-foreground"> (already added)</span>
                            )}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowScanPicker(false);
                      setScannedRepos([]);
                      setSelectedScannedRepos(new Set());
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleAddSelectedRepos}
                    disabled={selectedScannedRepos.size === 0}
                  >
                    Add {selectedScannedRepos.size > 0 ? `(${selectedScannedRepos.size})` : ""}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
