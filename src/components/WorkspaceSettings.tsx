import { useState, useEffect } from "react";
import { Trash2, Plus, Check, X, Star, Folder } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { Workspace } from "../types/agent";
import * as tauri from "../lib/tauri";

interface WorkspaceSettingsProps {
  onWorkspacesChange?: () => void;
}

interface WorkspaceSettingsData {
  branch_prefix?: string;
}

export function WorkspaceSettings({ onWorkspacesChange }: WorkspaceSettingsProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceSettings, setWorkspaceSettings] = useState<Record<string, WorkspaceSettingsData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [newBranchPrefix, setNewBranchPrefix] = useState("");
  const [editName, setEditName] = useState("");
  const [editPath, setEditPath] = useState("");
  const [editBranchPrefix, setEditBranchPrefix] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadWorkspaces = async () => {
    try {
      const ws = await tauri.getWorkspaces();
      setWorkspaces(ws);

      // Load settings for each workspace
      const settingsMap: Record<string, WorkspaceSettingsData> = {};
      for (const workspace of ws) {
        try {
          const settings = await tauri.getAllWorkspaceSettings(workspace.id);
          settingsMap[workspace.id] = {
            branch_prefix: settings.branch_prefix || "",
          };
        } catch {
          settingsMap[workspace.id] = {};
        }
      }
      setWorkspaceSettings(settingsMap);
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

  const handleBrowseFolder = async (isEdit: boolean) => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: "Select Repository Folder",
      });
      if (selected) {
        if (isEdit) {
          setEditPath(selected as string);
        } else {
          setNewPath(selected as string);
        }
      }
    } catch (err) {
      console.error("Failed to open folder dialog:", err);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !newPath.trim()) {
      setError("Name and folder path are required");
      return;
    }

    try {
      const workspace = await tauri.createWorkspace(newName.trim(), newPath.trim());

      // Save branch prefix if provided
      if (newBranchPrefix.trim()) {
        await tauri.setWorkspaceSetting(workspace.id, "branch_prefix", newBranchPrefix.trim());
      }

      setNewName("");
      setNewPath("");
      setNewBranchPrefix("");
      setIsCreating(false);
      setError(null);
      await loadWorkspaces();
      onWorkspacesChange?.();
    } catch (err) {
      setError(String(err));
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim() || !editPath.trim()) {
      setError("Name and folder path are required");
      return;
    }

    try {
      await tauri.updateWorkspace(id, editName.trim(), editPath.trim());

      // Update branch prefix setting
      if (editBranchPrefix.trim()) {
        await tauri.setWorkspaceSetting(id, "branch_prefix", editBranchPrefix.trim());
      } else {
        // Delete the setting if empty
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
    setEditPath(workspace.repos_folder_path);
    setEditBranchPrefix(workspaceSettings[workspace.id]?.branch_prefix || "");
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
            backgroundColor: "var(--bg-error)",
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
            <label
              className="block text-xs mb-1"
              style={{ color: "var(--text-dim)" }}
            >
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
            <label
              className="block text-xs mb-1"
              style={{ color: "var(--text-dim)" }}
            >
              Repository Folder
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                placeholder="/path/to/repos"
                className="flex-1 px-2 py-1.5 text-xs"
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
              <button
                onClick={() => handleBrowseFolder(false)}
                className="px-2 py-1 text-xs transition-colors"
                style={{
                  backgroundColor: "var(--bg-primary)",
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
                <Folder size={14} />
              </button>
            </div>
          </div>

          <div>
            <label
              className="block text-xs mb-1"
              style={{ color: "var(--text-dim)" }}
            >
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
                setNewPath("");
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
        <div
          className="text-xs text-center py-4"
          style={{ color: "var(--text-dim)" }}
        >
          No workspaces yet. Create one to organize your tasks by project.
        </div>
      ) : (
        <div className="space-y-2">
          {workspaces.map((workspace) => (
            <div
              key={workspace.id}
              className="p-3"
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-default)",
              }}
            >
              {editingId === workspace.id ? (
                // Edit mode
                <div className="space-y-3">
                  <div>
                    <label
                      className="block text-xs mb-1"
                      style={{ color: "var(--text-dim)" }}
                    >
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
                    <label
                      className="block text-xs mb-1"
                      style={{ color: "var(--text-dim)" }}
                    >
                      Repository Folder
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editPath}
                        onChange={(e) => setEditPath(e.target.value)}
                        className="flex-1 px-2 py-1.5 text-xs"
                        style={{
                          backgroundColor: "var(--bg-primary)",
                          border: "1px solid var(--border-default)",
                          color: "var(--text-primary)",
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={() => handleBrowseFolder(true)}
                        className="px-2 py-1 text-xs"
                        style={{
                          backgroundColor: "var(--bg-primary)",
                          border: "1px solid var(--border-default)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        <Folder size={14} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label
                      className="block text-xs mb-1"
                      style={{ color: "var(--text-dim)" }}
                    >
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
                // View mode
                <div className="flex items-start justify-between">
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => startEditing(workspace)}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {workspace.name}
                      </span>
                      {workspace.is_default && (
                        <Star
                          size={12}
                          fill="var(--accent-yellow)"
                          style={{ color: "var(--accent-yellow)" }}
                        />
                      )}
                    </div>
                    <div
                      className="text-xs mt-1 truncate"
                      style={{ color: "var(--text-dim)" }}
                      title={workspace.repos_folder_path}
                    >
                      {workspace.repos_folder_path}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-2">
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
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
