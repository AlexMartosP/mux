import { useState, useEffect } from "react";
import { Trash2, Plus, Check, X, Star, Folder, FolderSearch, ChevronRight, ChevronDown, Settings } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Workspace, WorkspaceRepository, RepositoryInfo } from "../types/agent";
import * as tauri from "../domains/tauri/commands";

interface WorkspaceSettingsProps {
  onWorkspacesChange?: () => void;
}

interface WorkspaceSettingsData {
  branch_prefix?: string;
}

export function WorkspaceSettings({ onWorkspacesChange }: WorkspaceSettingsProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceSettings, setWorkspaceSettings] = useState<Record<string, WorkspaceSettingsData>>({});
  const [workspaceRepos, setWorkspaceRepos] = useState<Record<string, WorkspaceRepository[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedWorkspaceId, setExpandedWorkspaceId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newBranchPrefix, setNewBranchPrefix] = useState("");
  const [editName, setEditName] = useState("");
  const [editBranchPrefix, setEditBranchPrefix] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Scan folder picker state
  const [showScanPicker, setShowScanPicker] = useState<string | null>(null);
  const [scannedRepos, setScannedRepos] = useState<RepositoryInfo[]>([]);
  const [selectedScannedRepos, setSelectedScannedRepos] = useState<Set<string>>(new Set());
  const [isScanning, setIsScanning] = useState(false);

  // Script editing state (key: "workspaceId:repoPath")
  const [editingScripts, setEditingScripts] = useState<string | null>(null);
  const [editSetupScript, setEditSetupScript] = useState("");
  const [editTeardownScript, setEditTeardownScript] = useState("");
  const [savingScripts, setSavingScripts] = useState(false);

  const loadWorkspaces = async () => {
    try {
      const ws = await tauri.getWorkspaces();
      setWorkspaces(ws);

      // Load settings and repos for each workspace
      const settingsMap: Record<string, WorkspaceSettingsData> = {};
      const reposMap: Record<string, WorkspaceRepository[]> = {};

      for (const workspace of ws) {
        try {
          const settings = await tauri.getAllWorkspaceSettings(workspace.id);
          settingsMap[workspace.id] = {
            branch_prefix: settings.branch_prefix || "",
          };
        } catch {
          settingsMap[workspace.id] = {};
        }

        try {
          const repos = await tauri.getWorkspaceRepositories(workspace.id);
          reposMap[workspace.id] = repos;
        } catch {
          reposMap[workspace.id] = [];
        }
      }
      setWorkspaceSettings(settingsMap);
      setWorkspaceRepos(reposMap);
    } catch (err) {
      console.error("Failed to load workspaces:", err);
      setError("Failed to load workspaces");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) {
      setError("Name is required");
      return;
    }

    try {
      // Create workspace with empty repos_folder_path (legacy field)
      const workspace = await tauri.createWorkspace(newName.trim(), "");

      // Save branch prefix if provided
      if (newBranchPrefix.trim()) {
        await tauri.setWorkspaceSetting(workspace.id, "branch_prefix", newBranchPrefix.trim());
      }

      setNewName("");
      setNewBranchPrefix("");
      setIsCreating(false);
      setError(null);
      await loadWorkspaces();
      onWorkspacesChange?.();

      // Expand the new workspace to add repos
      setExpandedWorkspaceId(workspace.id);
    } catch (err) {
      setError(String(err));
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) {
      setError("Name is required");
      return;
    }

    try {
      const workspace = workspaces.find((w) => w.id === id);
      await tauri.updateWorkspace(id, editName.trim(), workspace?.repos_folder_path || "");

      // Update branch prefix setting
      if (editBranchPrefix.trim()) {
        await tauri.setWorkspaceSetting(id, "branch_prefix", editBranchPrefix.trim());
      } else {
        await tauri.deleteWorkspaceSetting(id, "branch_prefix");
      }

      setEditingId(null);
      setError(null);
      await loadWorkspaces();
      onWorkspacesChange?.();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await tauri.deleteWorkspace(id);
      setError(null);
      if (expandedWorkspaceId === id) {
        setExpandedWorkspaceId(null);
      }
      await loadWorkspaces();
      onWorkspacesChange?.();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      await tauri.setDefaultWorkspace(id);
      setError(null);
      await loadWorkspaces();
      onWorkspacesChange?.();
    } catch (err) {
      setError(String(err));
    }
  };

  const startEditing = (workspace: Workspace) => {
    setEditingId(workspace.id);
    setEditName(workspace.name);
    setEditBranchPrefix(workspaceSettings[workspace.id]?.branch_prefix || "");
  };

  const handleAddSingleRepo = async (workspaceId: string) => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Repository",
      });
      if (selected) {
        const repoPath = selected as string;
        const repoName = repoPath.split("/").pop() || repoPath;
        await tauri.addRepositoryToWorkspace(workspaceId, repoPath, repoName);
        await loadWorkspaces();
      }
    } catch (err) {
      console.error("Failed to add repository:", err);
      setError(String(err));
    }
  };

  const handleScanFolder = async (workspaceId: string) => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Folder to Scan for Repositories",
      });
      if (selected) {
        setIsScanning(true);
        setShowScanPicker(workspaceId);
        const repos = await tauri.scanFolderForRepositories(selected as string);
        setScannedRepos(repos);
        setSelectedScannedRepos(new Set());
        setIsScanning(false);
      }
    } catch (err) {
      console.error("Failed to scan folder:", err);
      setIsScanning(false);
      setError(String(err));
    }
  };

  const handleAddSelectedRepos = async () => {
    if (!showScanPicker || selectedScannedRepos.size === 0) return;

    try {
      for (const repoPath of selectedScannedRepos) {
        const repo = scannedRepos.find((r) => r.path === repoPath);
        if (repo) {
          await tauri.addRepositoryToWorkspace(showScanPicker, repo.path, repo.name);
        }
      }
      setShowScanPicker(null);
      setScannedRepos([]);
      setSelectedScannedRepos(new Set());
      await loadWorkspaces();
    } catch (err) {
      console.error("Failed to add repositories:", err);
      setError(String(err));
    }
  };

  const handleRemoveRepo = async (workspaceId: string, repoPath: string) => {
    try {
      await tauri.removeRepositoryFromWorkspace(workspaceId, repoPath);
      await loadWorkspaces();
    } catch (err) {
      console.error("Failed to remove repository:", err);
      setError(String(err));
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

  const startEditingScripts = (workspaceId: string, repo: WorkspaceRepository) => {
    const key = `${workspaceId}:${repo.repository_path}`;
    setEditingScripts(key);
    setEditSetupScript(repo.setup_script || "");
    setEditTeardownScript(repo.teardown_script || "");
  };

  const cancelEditingScripts = () => {
    setEditingScripts(null);
    setEditSetupScript("");
    setEditTeardownScript("");
  };

  const handleSaveScripts = async (workspaceId: string, repoPath: string) => {
    try {
      setSavingScripts(true);
      await tauri.updateRepositoryScripts(
        workspaceId,
        repoPath,
        editSetupScript.trim() || undefined,
        editTeardownScript.trim() || undefined
      );
      setEditingScripts(null);
      setEditSetupScript("");
      setEditTeardownScript("");
      await loadWorkspaces();
    } catch (err) {
      console.error("Failed to save scripts:", err);
      setError(String(err));
    } finally {
      setSavingScripts(false);
    }
  };

  if (isLoading) {
    return (
      <div className="text-xs" style={{ color: "var(--text-dim)" }}>
        Loading workspaces...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          Workspaces
        </h3>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1 px-2 py-1 text-xs transition-colors"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-cyan)";
              e.currentTarget.style.color = "var(--accent-cyan)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <Plus size={12} />
            <span>Add Workspace</span>
          </button>
        )}
      </div>

      {error && (
        <div
          className="text-xs px-3 py-2"
          style={{
            backgroundColor: "var(--bg-error-subtle)",
            color: "var(--accent-red)",
            border: "1px solid var(--accent-red)",
          }}
        >
          {error}
        </div>
      )}

      {/* Create new workspace form */}
      {isCreating && (
        <div
          className="p-3 space-y-3"
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-dim)" }}>
              Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="My Workspace"
              className="w-full px-2 py-1.5 text-xs"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--border-active)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border-default)";
              }}
            />
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--text-dim)" }}>
              Branch Prefix (optional)
            </label>
            <input
              type="text"
              value={newBranchPrefix}
              onChange={(e) => setNewBranchPrefix(e.target.value)}
              placeholder="e.g., john-doe"
              className="w-full px-2 py-1.5 text-xs"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border-default)",
                color: "var(--text-primary)",
                outline: "none",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--border-active)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border-default)";
              }}
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setIsCreating(false);
                setNewName("");
                setNewBranchPrefix("");
                setError(null);
              }}
              className="px-3 py-1 text-xs transition-colors"
              style={{
                backgroundColor: "transparent",
                border: "1px solid var(--border-default)",
                color: "var(--text-secondary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "var(--border-active)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "var(--border-default)";
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="px-3 py-1 text-xs transition-colors"
              style={{
                backgroundColor: "var(--accent-cyan)",
                border: "none",
                color: "var(--bg-primary)",
              }}
            >
              Create
            </button>
          </div>
        </div>
      )}

      {/* Workspace list */}
      {workspaces.length === 0 && !isCreating ? (
        <div className="text-xs text-center py-4" style={{ color: "var(--text-dim)" }}>
          No workspaces yet. Create one to organize your agents by project.
        </div>
      ) : (
        <div className="space-y-2">
          {workspaces.map((workspace) => {
            const isExpanded = expandedWorkspaceId === workspace.id;
            const repos = workspaceRepos[workspace.id] || [];

            return (
              <div
                key={workspace.id}
                style={{
                  backgroundColor: "var(--bg-surface)",
                  border: "1px solid var(--border-default)",
                }}
              >
                {editingId === workspace.id ? (
                  // Edit mode
                  <div className="p-3 space-y-3">
                    <div>
                      <label className="block text-xs mb-1" style={{ color: "var(--text-dim)" }}>
                        Name
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2 py-1.5 text-xs"
                        style={{
                          backgroundColor: "var(--bg-primary)",
                          border: "1px solid var(--border-default)",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                    </div>

                    <div>
                      <label className="block text-xs mb-1" style={{ color: "var(--text-dim)" }}>
                        Branch Prefix (optional)
                      </label>
                      <input
                        type="text"
                        value={editBranchPrefix}
                        onChange={(e) => setEditBranchPrefix(e.target.value)}
                        placeholder="e.g., john-doe"
                        className="w-full px-2 py-1.5 text-xs"
                        style={{
                          backgroundColor: "var(--bg-primary)",
                          border: "1px solid var(--border-default)",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setError(null);
                        }}
                        className="p-1 transition-colors"
                        style={{ color: "var(--text-dim)" }}
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                      <button
                        onClick={() => handleUpdate(workspace.id)}
                        className="p-1 transition-colors"
                        style={{ color: "var(--accent-green)" }}
                        title="Save"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Workspace header */}
                    <div
                      className="p-3 flex items-center justify-between cursor-pointer"
                      onClick={() => setExpandedWorkspaceId(isExpanded ? null : workspace.id)}
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown size={14} style={{ color: "var(--text-dim)" }} />
                        ) : (
                          <ChevronRight size={14} style={{ color: "var(--text-dim)" }} />
                        )}
                        <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                          {workspace.name}
                        </span>
                        {workspace.is_default && (
                          <Star size={12} fill="var(--accent-yellow)" style={{ color: "var(--accent-yellow)" }} />
                        )}
                        <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                          ({repos.length} {repos.length === 1 ? "repo" : "repos"})
                        </span>
                      </div>

                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => startEditing(workspace)}
                          className="p-1 transition-colors text-xs"
                          style={{ color: "var(--text-dim)" }}
                          title="Edit workspace"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "var(--accent-cyan)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--text-dim)";
                          }}
                        >
                          Edit
                        </button>
                        {!workspace.is_default && (
                          <button
                            onClick={() => handleSetDefault(workspace.id)}
                            className="p-1 transition-colors"
                            style={{ color: "var(--text-dim)" }}
                            title="Set as default"
                            onMouseEnter={(e) => {
                              e.currentTarget.style.color = "var(--accent-yellow)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.color = "var(--text-dim)";
                            }}
                          >
                            <Star size={14} />
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(workspace.id)}
                          className="p-1 transition-colors"
                          style={{ color: "var(--text-dim)" }}
                          title="Delete workspace"
                          onMouseEnter={(e) => {
                            e.currentTarget.style.color = "var(--accent-red)";
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.color = "var(--text-dim)";
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Expanded content: repository list */}
                    {isExpanded && (
                      <div
                        className="px-3 pb-3"
                        style={{ borderTop: "1px solid var(--border-default)" }}
                      >
                        {/* Add repository buttons */}
                        <div className="flex gap-2 py-2">
                          <button
                            onClick={() => handleAddSingleRepo(workspace.id)}
                            className="flex items-center gap-1 px-2 py-1 text-xs transition-colors"
                            style={{
                              backgroundColor: "var(--bg-primary)",
                              border: "1px solid var(--border-default)",
                              color: "var(--text-secondary)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = "var(--accent-cyan)";
                              e.currentTarget.style.color = "var(--accent-cyan)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "var(--border-default)";
                              e.currentTarget.style.color = "var(--text-secondary)";
                            }}
                          >
                            <Folder size={12} />
                            <span>Add Repository</span>
                          </button>
                          <button
                            onClick={() => handleScanFolder(workspace.id)}
                            className="flex items-center gap-1 px-2 py-1 text-xs transition-colors"
                            style={{
                              backgroundColor: "var(--bg-primary)",
                              border: "1px solid var(--border-default)",
                              color: "var(--text-secondary)",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = "var(--accent-cyan)";
                              e.currentTarget.style.color = "var(--accent-cyan)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = "var(--border-default)";
                              e.currentTarget.style.color = "var(--text-secondary)";
                            }}
                          >
                            <FolderSearch size={12} />
                            <span>Scan Folder</span>
                          </button>
                        </div>

                        {/* Repository list */}
                        {repos.length === 0 ? (
                          <div className="text-xs py-2" style={{ color: "var(--text-dim)" }}>
                            No repositories added yet.
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {repos.map((repo) => {
                              const scriptKey = `${workspace.id}:${repo.repository_path}`;
                              const isEditingThisRepo = editingScripts === scriptKey;
                              const hasScripts = repo.setup_script || repo.teardown_script;

                              return (
                                <div
                                  key={repo.repository_path}
                                  style={{
                                    backgroundColor: "var(--bg-primary)",
                                    border: "1px solid var(--border-default)",
                                  }}
                                >
                                  <div className="flex items-center justify-between py-1 px-2">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs font-medium truncate" style={{ color: "var(--text-primary)" }}>
                                          {repo.name}
                                        </span>
                                        {hasScripts && (
                                          <span
                                            className="text-xs px-1 py-0.5"
                                            style={{
                                              backgroundColor: "var(--bg-accent-subtle)",
                                              color: "var(--accent-cyan)",
                                              fontSize: "10px",
                                            }}
                                            title="Has lifecycle scripts"
                                          >
                                            scripts
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs truncate" style={{ color: "var(--text-dim)" }} title={repo.repository_path}>
                                        {repo.repository_path}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 ml-2">
                                      <button
                                        onClick={() => isEditingThisRepo ? cancelEditingScripts() : startEditingScripts(workspace.id, repo)}
                                        className="p-1 transition-colors"
                                        style={{ color: isEditingThisRepo ? "var(--accent-cyan)" : "var(--text-dim)" }}
                                        title="Configure scripts"
                                        onMouseEnter={(e) => {
                                          if (!isEditingThisRepo) e.currentTarget.style.color = "var(--accent-cyan)";
                                        }}
                                        onMouseLeave={(e) => {
                                          if (!isEditingThisRepo) e.currentTarget.style.color = "var(--text-dim)";
                                        }}
                                      >
                                        <Settings size={14} />
                                      </button>
                                      <button
                                        onClick={() => handleRemoveRepo(workspace.id, repo.repository_path)}
                                        className="p-1 transition-colors"
                                        style={{ color: "var(--text-dim)" }}
                                        title="Remove from workspace"
                                        onMouseEnter={(e) => {
                                          e.currentTarget.style.color = "var(--accent-red)";
                                        }}
                                        onMouseLeave={(e) => {
                                          e.currentTarget.style.color = "var(--text-dim)";
                                        }}
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  </div>

                                  {/* Script editing panel */}
                                  {isEditingThisRepo && (
                                    <div
                                      className="px-2 pb-2 space-y-2"
                                      style={{ borderTop: "1px solid var(--border-default)" }}
                                    >
                                      <div className="pt-2">
                                        <label className="block text-xs mb-1" style={{ color: "var(--text-dim)" }}>
                                          Setup Script
                                          <span className="ml-1" style={{ color: "var(--text-dim)", fontStyle: "italic" }}>
                                            (runs when agent starts)
                                          </span>
                                        </label>
                                        <textarea
                                          value={editSetupScript}
                                          onChange={(e) => setEditSetupScript(e.target.value)}
                                          placeholder="e.g., npm install"
                                          rows={2}
                                          className="w-full px-2 py-1.5 text-xs font-mono resize-y"
                                          style={{
                                            backgroundColor: "var(--bg-elevated)",
                                            border: "1px solid var(--border-default)",
                                            color: "var(--text-primary)",
                                            outline: "none",
                                          }}
                                          onFocus={(e) => {
                                            e.currentTarget.style.borderColor = "var(--border-active)";
                                          }}
                                          onBlur={(e) => {
                                            e.currentTarget.style.borderColor = "var(--border-default)";
                                          }}
                                        />
                                      </div>

                                      <div>
                                        <label className="block text-xs mb-1" style={{ color: "var(--text-dim)" }}>
                                          Teardown Script
                                          <span className="ml-1" style={{ color: "var(--text-dim)", fontStyle: "italic" }}>
                                            (runs when agent is deleted)
                                          </span>
                                        </label>
                                        <textarea
                                          value={editTeardownScript}
                                          onChange={(e) => setEditTeardownScript(e.target.value)}
                                          placeholder="e.g., docker-compose down"
                                          rows={2}
                                          className="w-full px-2 py-1.5 text-xs font-mono resize-y"
                                          style={{
                                            backgroundColor: "var(--bg-elevated)",
                                            border: "1px solid var(--border-default)",
                                            color: "var(--text-primary)",
                                            outline: "none",
                                          }}
                                          onFocus={(e) => {
                                            e.currentTarget.style.borderColor = "var(--border-active)";
                                          }}
                                          onBlur={(e) => {
                                            e.currentTarget.style.borderColor = "var(--border-default)";
                                          }}
                                        />
                                      </div>

                                      <div className="flex justify-end gap-2">
                                        <button
                                          onClick={cancelEditingScripts}
                                          disabled={savingScripts}
                                          className="px-2 py-1 text-xs transition-colors"
                                          style={{
                                            backgroundColor: "transparent",
                                            border: "1px solid var(--border-default)",
                                            color: "var(--text-secondary)",
                                          }}
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={() => handleSaveScripts(workspace.id, repo.repository_path)}
                                          disabled={savingScripts}
                                          className="px-2 py-1 text-xs transition-colors"
                                          style={{
                                            backgroundColor: "var(--accent-cyan)",
                                            border: "none",
                                            color: "var(--bg-primary)",
                                            opacity: savingScripts ? 0.7 : 1,
                                          }}
                                        >
                                          {savingScripts ? "Saving..." : "Save"}
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Scan folder picker modal */}
                        {showScanPicker === workspace.id && (
                          <div
                            className="mt-3 p-3"
                            style={{
                              backgroundColor: "var(--bg-elevated)",
                              border: "1px solid var(--border-active)",
                            }}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
                                Select repositories to add
                              </span>
                              <button
                                onClick={() => {
                                  setShowScanPicker(null);
                                  setScannedRepos([]);
                                  setSelectedScannedRepos(new Set());
                                }}
                                className="p-1"
                                style={{ color: "var(--text-dim)" }}
                              >
                                <X size={14} />
                              </button>
                            </div>

                            {isScanning ? (
                              <div className="text-xs py-4 text-center" style={{ color: "var(--text-dim)" }}>
                                Scanning...
                              </div>
                            ) : scannedRepos.length === 0 ? (
                              <div className="text-xs py-4 text-center" style={{ color: "var(--text-dim)" }}>
                                No git repositories found in the selected folder.
                              </div>
                            ) : (
                              <>
                                <div className="max-h-48 overflow-auto space-y-1 mb-2">
                                  {scannedRepos.map((repo) => {
                                    const isSelected = selectedScannedRepos.has(repo.path);
                                    const isAlreadyAdded = repos.some((r) => r.repository_path === repo.path);

                                    return (
                                      <label
                                        key={repo.path}
                                        className="flex items-center gap-2 py-1 px-2 cursor-pointer"
                                        style={{
                                          backgroundColor: isSelected ? "var(--bg-accent-subtle)" : "var(--bg-primary)",
                                          border: "1px solid var(--border-default)",
                                          opacity: isAlreadyAdded ? 0.5 : 1,
                                        }}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isSelected}
                                          onChange={() => !isAlreadyAdded && toggleRepoSelection(repo.path)}
                                          disabled={isAlreadyAdded}
                                          style={{ accentColor: "var(--accent-cyan)" }}
                                        />
                                        <div className="flex-1 min-w-0">
                                          <div className="text-xs truncate" style={{ color: "var(--text-primary)" }}>
                                            {repo.name}
                                            {isAlreadyAdded && (
                                              <span style={{ color: "var(--text-dim)" }}> (already added)</span>
                                            )}
                                          </div>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>

                                <div className="flex justify-end gap-2">
                                  <button
                                    onClick={() => {
                                      setShowScanPicker(null);
                                      setScannedRepos([]);
                                      setSelectedScannedRepos(new Set());
                                    }}
                                    className="px-3 py-1 text-xs transition-colors"
                                    style={{
                                      backgroundColor: "transparent",
                                      border: "1px solid var(--border-default)",
                                      color: "var(--text-secondary)",
                                    }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={handleAddSelectedRepos}
                                    disabled={selectedScannedRepos.size === 0}
                                    className="px-3 py-1 text-xs transition-colors"
                                    style={{
                                      backgroundColor: selectedScannedRepos.size > 0 ? "var(--accent-cyan)" : "var(--bg-surface)",
                                      border: "none",
                                      color: selectedScannedRepos.size > 0 ? "var(--bg-primary)" : "var(--text-dim)",
                                      cursor: selectedScannedRepos.size > 0 ? "pointer" : "not-allowed",
                                    }}
                                  >
                                    Add {selectedScannedRepos.size > 0 ? `(${selectedScannedRepos.size})` : ""}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
