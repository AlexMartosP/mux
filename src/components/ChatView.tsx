import { useState, useRef, useEffect, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { Task } from "../types/task";
import { useTaskOutput } from "../hooks/useTaskOutput";
import { useTaskActivity } from "../hooks/useTaskActivity";
import { usePermissions } from "../hooks/usePermissions";
import { useSlashCommands } from "../hooks/useSlashCommands";
import { ChangesPanel } from "./ChangesPanel";
import { ActivityFeed } from "./ActivityFeed";
import { OutputRenderer } from "./OutputRenderer";
import { PermissionPopover } from "./PermissionPopover";
import { HandbackModal } from "./HandbackModal";
import { InlineError } from "./ErrorDisplay";
import * as tauri from "../lib/tauri";
import type { RepoInfo } from "../lib/tauri";

interface FollowUpMessage {
  id: string;
  content: string;
  timestamp: string;
  outputIndex: number; // Output array index when this follow-up was sent
}

interface ChatViewProps {
  task: Task | null;
  onCreateTask: (repositoryPath: string, prompt: string, existingBranch?: string, baseBranch?: string) => Promise<void>;
  onStop: (id: string) => void;
  onRestart: (id: string, prompt?: string) => void;
  onDelete: (id: string) => void;
  onUpdateTask?: (task: Task) => void;
}

const statusConfig: Record<Task["status"], { indicator: string; color: string }> = {
  idle: { indicator: "IDLE", color: "var(--text-dim)" },
  running: { indicator: "RUNNING", color: "var(--accent-green)" },
  waiting_input: { indicator: "WAITING", color: "var(--accent-yellow)" },
  completed: { indicator: "COMPLETED", color: "var(--text-secondary)" },
  error: { indicator: "ERROR", color: "var(--accent-red)" },
  manual_control: { indicator: "MANUAL", color: "var(--accent-magenta)" },
  interrupted: { indicator: "INTERRUPTED", color: "var(--accent-orange, #f97316)" },
  queued: { indicator: "QUEUED", color: "var(--accent-cyan)" },
};

export function ChatView({
  task,
  onCreateTask,
  onStop,
  onRestart,
  onDelete,
  onUpdateTask,
}: ChatViewProps) {
  const [repositoryPath, setRepositoryPath] = useState("");
  const [prompt, setPrompt] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followUpPrompt, setFollowUpPrompt] = useState("");
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
  const [showNewTaskSlashCommands, setShowNewTaskSlashCommands] = useState(false);
  const [newTaskSelectedCommandIndex, setNewTaskSelectedCommandIndex] = useState(0);
  const [availableRepos, setAvailableRepos] = useState<RepoInfo[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [branchSearch, setBranchSearch] = useState("");
  const [branches, setBranches] = useState<{ name: string; is_current: boolean; last_commit_date: string }[]>([]);
  const [showBranchSelector, setShowBranchSelector] = useState(false);
  const branchSelectorRef = useRef<HTMLDivElement>(null);
  // Base branch selector (which branch to fork from when creating a new branch)
  const [selectedBaseBranch, setSelectedBaseBranch] = useState<string>("");
  const [baseBranchSearch, setBaseBranchSearch] = useState("");
  const [showBaseBranchSelector, setShowBaseBranchSelector] = useState(false);
  const baseBranchSelectorRef = useRef<HTMLDivElement>(null);
  // Real-time base branch for task view
  const [currentBaseBranch, setCurrentBaseBranch] = useState<string | null>(null);
  // Send key setting
  const [sendWithEnter, setSendWithEnter] = useState(false);

  // Load send key setting
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await tauri.getSettings();
        setSendWithEnter(settings.send_with_enter);
      } catch {
        // Default to false
      }
    };
    loadSettings();
  }, []);

  // Use cached slash commands
  const { commands: slashCommands, refresh: refreshSlashCommands } = useSlashCommands(task?.repository_path);
  const { commands: newTaskSlashCommands, refresh: refreshNewTaskSlashCommands } = useSlashCommands(task ? undefined : repositoryPath || undefined);
  const [followUpMessages, setFollowUpMessages] = useState<FollowUpMessage[]>([]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [copiedBranch, setCopiedBranch] = useState(false);
  const [isHandbackModalOpen, setIsHandbackModalOpen] = useState(false);
  const [isTakingOver, setIsTakingOver] = useState(false);
  const [takeoverError, setTakeoverError] = useState<string | null>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [openInMenuOpen, setOpenInMenuOpen] = useState(false);
  const [changesPanelWidth, setChangesPanelWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const [changesPanelFullScreen, setChangesPanelFullScreen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const followUpTextareaRef = useRef<HTMLTextAreaElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const openInMenuRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Fetch available repositories from base directory
  useEffect(() => {
    const fetchRepos = async () => {
      try {
        const repos = await tauri.listRepositories();
        setAvailableRepos(repos);
      } catch (err) {
        console.error("Failed to fetch repositories:", err);
      }
    };
    fetchRepos();
  }, []);

  // Load branches when repo path changes
  useEffect(() => {
    if (!repositoryPath) {
      setBranches([]);
      setSelectedBranch("");
      setSelectedBaseBranch("");
      return;
    }
    const loadBranches = async () => {
      try {
        const branchList = await tauri.listBranches(repositoryPath);
        setBranches(branchList);
      } catch {
        setBranches([]);
      }
    };
    loadBranches();
  }, [repositoryPath]);

  // Close branch selector on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (branchSelectorRef.current && !branchSelectorRef.current.contains(e.target as Node)) {
        setShowBranchSelector(false);
      }
    };
    if (showBranchSelector) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showBranchSelector]);

  // Close base branch selector on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (baseBranchSelectorRef.current && !baseBranchSelectorRef.current.contains(e.target as Node)) {
        setShowBaseBranchSelector(false);
      }
    };
    if (showBaseBranchSelector) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showBaseBranchSelector]);

  const filteredBranches = useMemo(() => {
    if (!branchSearch) return branches;
    const q = branchSearch.toLowerCase();
    return branches.filter(b => b.name.toLowerCase().includes(q));
  }, [branches, branchSearch]);

  const filteredBaseBranches = useMemo(() => {
    if (!baseBranchSearch) return branches;
    const q = baseBranchSearch.toLowerCase();
    return branches.filter(b => b.name.toLowerCase().includes(q));
  }, [branches, baseBranchSearch]);

  const { output, outputRef, isLoadingMore, hasMore, remainingCount, loadMore } = useTaskOutput(task?.id ?? null);
  const { currentActivity, activeAgent } = useTaskActivity(task?.id ?? null);
  const { currentRequest: permissionRequest, dismissRequest } = usePermissions(task?.id);

  // Fetch current base branch from git (real-time sync for rebases)
  useEffect(() => {
    if (!task?.id) {
      setCurrentBaseBranch(null);
      return;
    }

    // Initial fetch
    const fetchBaseBranch = async () => {
      try {
        const base = await tauri.getBranchBase(task.id);
        setCurrentBaseBranch(base);
      } catch {
        // Fall back to stored base_branch if git query fails
        setCurrentBaseBranch(task.base_branch ?? null);
      }
    };
    fetchBaseBranch();

    // Poll every 10 seconds to catch rebases
    const interval = setInterval(fetchBaseBranch, 10000);
    return () => clearInterval(interval);
  }, [task?.id, task?.base_branch]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [prompt]);

  // Close dropdown menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setMoreMenuOpen(false);
      }
      if (openInMenuRef.current && !openInMenuRef.current.contains(e.target as Node)) {
        setOpenInMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle panel resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !resizeRef.current) return;
      const delta = resizeRef.current.startX - e.clientX;
      const newWidth = Math.max(resizeRef.current.startWidth + delta, 200); // Min 200px, no max
      setChangesPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeRef.current = { startX: e.clientX, startWidth: changesPanelWidth };
  };

  const openInEditor = async (editor: 'vscode' | 'cursor') => {
    if (!task) return;
    try {
      await tauri.openInEditor(task.worktree_path, editor);
    } catch (err) {
      console.error(`Failed to open in ${editor}:`, err);
    }
    setOpenInMenuOpen(false);
  };

  const handleBrowse = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Repository",
      });
      if (selected && typeof selected === "string") {
        setRepositoryPath(selected);
      }
    } catch (err) {
      console.error("Failed to open folder picker:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repositoryPath.trim() || !prompt.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Only pass baseBranch if we're creating a new branch (not using an existing one)
      const baseBranchToUse = selectedBranch ? undefined : (selectedBaseBranch || undefined);
      await onCreateTask(repositoryPath.trim(), prompt.trim(), selectedBranch || undefined, baseBranchToUse);
      setPrompt("");
      setSelectedBaseBranch("");
    } catch (err) {
      console.error("Failed to create task:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle prompt change for new task (with slash command detection)
  const handlePromptChange = (value: string) => {
    setPrompt(value);
    setShowNewTaskSlashCommands(value.startsWith("/") && value.length > 0 && repositoryPath !== "");
    setNewTaskSelectedCommandIndex(0);
  };

  // Select a slash command for new task
  const handleSelectNewTaskCommand = (command: string) => {
    setPrompt(command + " ");
    setShowNewTaskSlashCommands(false);
    textareaRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle slash command navigation
    if (showNewTaskSlashCommands && filteredNewTaskCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setNewTaskSelectedCommandIndex((prev) =>
          prev < filteredNewTaskCommands.length - 1 ? prev + 1 : 0
        );
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setNewTaskSelectedCommandIndex((prev) =>
          prev > 0 ? prev - 1 : filteredNewTaskCommands.length - 1
        );
        return;
      } else if (e.key === "Tab") {
        e.preventDefault();
        handleSelectNewTaskCommand(filteredNewTaskCommands[newTaskSelectedCommandIndex].command);
        return;
      } else if (e.key === "Escape") {
        setShowNewTaskSlashCommands(false);
        return;
      }
    }
    // Submit handling based on sendWithEnter setting
    if (e.key === "Enter") {
      if (sendWithEnter) {
        // Enter to send, Shift+Enter for new line
        if (!e.shiftKey) {
          e.preventDefault();
          handleSubmit(e);
        }
      } else {
        // Cmd/Ctrl+Enter to send
        if (e.metaKey || e.ctrlKey) {
          handleSubmit(e);
        }
      }
    }
  };

  // Filter slash commands based on input
  const filteredCommands = useMemo(() => {
    if (!followUpPrompt.startsWith("/")) return [];
    const query = followUpPrompt.toLowerCase();
    return slashCommands.filter((cmd) =>
      cmd.command.toLowerCase().startsWith(query)
    );
  }, [followUpPrompt, slashCommands]);

  // Filter slash commands for new task input
  const filteredNewTaskCommands = useMemo(() => {
    if (!prompt.startsWith("/")) return [];
    const query = prompt.toLowerCase();
    return newTaskSlashCommands.filter((cmd) =>
      cmd.command.toLowerCase().startsWith(query)
    );
  }, [prompt, newTaskSlashCommands]);

  const handleFollowUpChange = (value: string) => {
    setFollowUpPrompt(value);
    setShowSlashCommands(value.startsWith("/") && value.length > 0);
    setSelectedCommandIndex(0);
  };

  const handleSelectCommand = (command: string) => {
    setFollowUpPrompt(command + " ");
    setShowSlashCommands(false);
    followUpTextareaRef.current?.focus();
  };

  const handleFollowUpKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashCommands && filteredCommands.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedCommandIndex((prev) =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
      } else if (e.key === "Tab") {
        e.preventDefault();
        handleSelectCommand(filteredCommands[selectedCommandIndex].command);
      } else if (e.key === "Escape") {
        setShowSlashCommands(false);
      }
    }
    // Submit handling based on sendWithEnter setting
    if (e.key === "Enter") {
      if (sendWithEnter) {
        // Enter to send, Shift+Enter for new line
        if (!e.shiftKey) {
          e.preventDefault();
          handleFollowUpSubmit();
        }
      } else {
        // Cmd/Ctrl+Enter to send
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          handleFollowUpSubmit();
        }
      }
    }
  };

  const handleFollowUpSubmit = () => {
    if (!task || !followUpPrompt.trim()) return;
    // Add message to local state for display, recording current output index
    // so we can render the follow-up between the right output segments
    const newMessage: FollowUpMessage = {
      id: crypto.randomUUID(),
      content: followUpPrompt.trim(),
      timestamp: new Date().toISOString(),
      outputIndex: output.length, // Mark where in the output this follow-up was sent
    };
    setFollowUpMessages((prev) => [...prev, newMessage]);
    onRestart(task.id, followUpPrompt.trim());
    setFollowUpPrompt("");
    setShowSlashCommands(false);
  };

  // Auto-resize follow-up textarea
  useEffect(() => {
    if (followUpTextareaRef.current) {
      followUpTextareaRef.current.style.height = "auto";
      followUpTextareaRef.current.style.height = `${Math.min(followUpTextareaRef.current.scrollHeight, 150)}px`;
    }
  }, [followUpPrompt]);

  // Copy branch to clipboard
  const handleCopyBranch = async () => {
    if (task) {
      await writeText(task.branch);
      setCopiedBranch(true);
      setTimeout(() => setCopiedBranch(false), 2000);
    }
  };

  // Handle title edit
  const startEditingTitle = () => {
    if (task) {
      setEditedTitle(task.name);
      setEditingTitle(true);
    }
  };

  const saveTitle = async () => {
    if (task && editedTitle.trim() && onUpdateTask) {
      await tauri.updateTaskName(task.id, editedTitle.trim());
      onUpdateTask({ ...task, name: editedTitle.trim() });
    }
    setEditingTitle(false);
  };

  // Handle description edit
  const startEditingDescription = () => {
    if (task) {
      setEditedDescription(task.description || "");
      setEditingDescription(true);
    }
  };

  const saveDescription = async () => {
    if (task && onUpdateTask) {
      await tauri.updateTaskDescription(task.id, editedDescription.trim());
      onUpdateTask({ ...task, description: editedDescription.trim() });
    }
    setEditingDescription(false);
  };

  // Clear follow-up messages when task changes
  useEffect(() => {
    setFollowUpMessages([]);
  }, [task?.id]);

  // New task view
  if (!task) {
    return (
      <div className="flex-1 flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <header className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>NEW TASK</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Select a repository and describe what you want Claude to do
          </p>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {availableRepos.length > 0 ? (
            <div>
              <h3 className="text-xs font-medium mb-3" style={{ color: 'var(--text-dim)' }}>
                REPOSITORIES
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {availableRepos.map((repo) => (
                  <button
                    key={repo.path}
                    onClick={() => setRepositoryPath(repo.path)}
                    className="text-left px-3 py-2 text-xs transition-colors"
                    style={{
                      backgroundColor: repositoryPath === repo.path ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                      border: `1px solid ${repositoryPath === repo.path ? 'var(--accent-cyan)' : 'var(--border-default)'}`,
                      color: repositoryPath === repo.path ? 'var(--text-primary)' : 'var(--text-secondary)',
                    }}
                    onMouseEnter={(e) => {
                      if (repositoryPath !== repo.path) {
                        e.currentTarget.style.borderColor = 'var(--border-active)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (repositoryPath !== repo.path) {
                        e.currentTarget.style.borderColor = 'var(--border-default)';
                      }
                    }}
                  >
                    <span className="truncate">{repo.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center" style={{ color: 'var(--text-dim)' }}>
              <div className="text-4xl mb-4">_</div>
              <p className="text-xs">No base directory configured.</p>
              <p className="text-xs mt-1">Go to Settings to set a base repository directory,</p>
              <p className="text-xs">or browse manually below.</p>
            </div>
          )}
        </div>

        <div className="p-4 relative" style={{ borderTop: '1px solid var(--border-default)' }}>
          {error && (
            <div className="mb-4">
              <InlineError message={error} />
            </div>
          )}

          {/* Slash command suggestions for new task */}
          {showNewTaskSlashCommands && filteredNewTaskCommands.length > 0 && (
            <div
              className="absolute bottom-full left-4 right-4 mb-1"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-active)',
              }}
            >
              {filteredNewTaskCommands.map((cmd, index) => (
                <button
                  key={cmd.command}
                  onClick={() => handleSelectNewTaskCommand(cmd.command)}
                  className="w-full text-left px-3 py-2 flex items-center gap-3 transition-colors"
                  style={{
                    backgroundColor:
                      index === newTaskSelectedCommandIndex
                        ? 'var(--bg-elevated)'
                        : 'transparent',
                  }}
                  onMouseEnter={() => setNewTaskSelectedCommandIndex(index)}
                >
                  <span
                    className="text-xs font-medium"
                    style={{ color: 'var(--accent-cyan)' }}
                  >
                    {cmd.command}
                  </span>
                  <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-dim)' }}>
                    {cmd.description}
                  </span>
                  <span
                    className="text-xs px-1.5 py-0.5"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-default)',
                      color: cmd.source === 'project' ? 'var(--accent-green)' :
                             cmd.source === 'global' ? 'var(--accent-yellow)' :
                             'var(--text-dim)',
                    }}
                  >
                    {cmd.source}
                  </span>
                </button>
              ))}
              <div
                className="px-3 py-1.5 text-xs flex items-center justify-between"
                style={{
                  color: 'var(--text-dim)',
                  borderTop: '1px solid var(--border-default)',
                }}
              >
                <span>↑↓ navigate • Tab select • Esc close</span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    refreshNewTaskSlashCommands();
                  }}
                  className="text-xs transition-colors"
                  style={{ color: 'var(--text-dim)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
                  title="Refresh commands"
                >
                  [↻]
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBrowse}
                className="flex items-center gap-2 px-3 py-2 text-xs transition-colors"
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-active)',
                  color: 'var(--text-secondary)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-cyan)';
                  e.currentTarget.style.color = 'var(--accent-cyan)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border-active)';
                  e.currentTarget.style.color = 'var(--text-secondary)';
                }}
              >
                <span style={{ color: 'var(--accent-cyan)' }}>[...]</span>
                BROWSE OTHER
              </button>
              {repositoryPath && (
                <span className="text-xs truncate flex-1" style={{ color: 'var(--text-primary)' }}>
                  {repositoryPath}
                </span>
              )}
            </div>

            {/* Branch selector */}
            {repositoryPath && branches.length > 0 && (
              <div className="relative" ref={branchSelectorRef}>
                <button
                  type="button"
                  onClick={() => setShowBranchSelector(!showBranchSelector)}
                  className="px-3 py-2 text-xs transition-colors flex items-center gap-2"
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${selectedBranch ? 'var(--accent-cyan)' : 'var(--border-default)'}`,
                    color: selectedBranch ? 'var(--text-primary)' : 'var(--text-dim)',
                  }}
                >
                  <span style={{ color: 'var(--accent-cyan)' }}>[B]</span>
                  {selectedBranch ? (
                    <span className="truncate max-w-[200px]">{selectedBranch}</span>
                  ) : (
                    <span>New branch (auto-generated)</span>
                  )}
                  <span style={{ color: 'var(--text-dim)' }}>{showBranchSelector ? '▲' : '▼'}</span>
                </button>

                {showBranchSelector && (
                  <div
                    className="absolute bottom-full left-0 mb-1 w-80 max-h-60 overflow-hidden flex flex-col z-50"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-active)',
                    }}
                  >
                    <input
                      type="text"
                      value={branchSearch}
                      onChange={(e) => setBranchSearch(e.target.value)}
                      placeholder="Search branches..."
                      className="px-3 py-2 text-xs"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: 'none',
                        borderBottom: '1px solid var(--border-default)',
                        color: 'var(--text-primary)',
                      }}
                      autoFocus
                    />
                    <div className="overflow-y-auto flex-1">
                      {/* Auto-generate option */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBranch("");
                          setShowBranchSelector(false);
                          setBranchSearch("");
                        }}
                        className="w-full text-left px-3 py-2 text-xs transition-colors"
                        style={{
                          backgroundColor: !selectedBranch ? 'var(--bg-surface)' : 'transparent',
                          color: !selectedBranch ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                          borderBottom: '1px solid var(--border-default)',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = !selectedBranch ? 'var(--bg-surface)' : 'transparent'}
                      >
                        <span style={{ color: 'var(--accent-cyan)' }}>+</span> New branch (auto-generated)
                      </button>

                      {filteredBranches.map((branch) => (
                        <button
                          type="button"
                          key={branch.name}
                          onClick={() => {
                            setSelectedBranch(branch.name);
                            setShowBranchSelector(false);
                            setBranchSearch("");
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2"
                          style={{
                            backgroundColor: selectedBranch === branch.name ? 'var(--bg-surface)' : 'transparent',
                            color: selectedBranch === branch.name ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedBranch === branch.name ? 'var(--bg-surface)' : 'transparent'}
                        >
                          <span className="truncate flex-1">{branch.name}</span>
                          {branch.is_current && (
                            <span style={{ color: 'var(--accent-green)' }}>*</span>
                          )}
                        </button>
                      ))}
                      {filteredBranches.length === 0 && branchSearch && (
                        <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                          No matching branches
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Base branch selector - only show when creating a new branch */}
            {repositoryPath && branches.length > 0 && !selectedBranch && (
              <div className="relative" ref={baseBranchSelectorRef}>
                <button
                  type="button"
                  onClick={() => setShowBaseBranchSelector(!showBaseBranchSelector)}
                  className="px-3 py-2 text-xs transition-colors flex items-center gap-2"
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${selectedBaseBranch ? 'var(--accent-yellow)' : 'var(--border-default)'}`,
                    color: selectedBaseBranch ? 'var(--text-primary)' : 'var(--text-dim)',
                  }}
                >
                  <span style={{ color: 'var(--accent-yellow)' }}>[↑]</span>
                  {selectedBaseBranch ? (
                    <>
                      <span>Based on:</span>
                      <span className="truncate max-w-[150px]" style={{ color: 'var(--accent-yellow)' }}>{selectedBaseBranch}</span>
                    </>
                  ) : (
                    <span>Fork from default branch</span>
                  )}
                  <span style={{ color: 'var(--text-dim)' }}>{showBaseBranchSelector ? '▲' : '▼'}</span>
                </button>

                {showBaseBranchSelector && (
                  <div
                    className="absolute bottom-full left-0 mb-1 w-80 max-h-60 overflow-hidden flex flex-col z-50"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-active)',
                    }}
                  >
                    <input
                      type="text"
                      value={baseBranchSearch}
                      onChange={(e) => setBaseBranchSearch(e.target.value)}
                      placeholder="Search branches to fork from..."
                      className="px-3 py-2 text-xs"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        border: 'none',
                        borderBottom: '1px solid var(--border-default)',
                        color: 'var(--text-primary)',
                      }}
                      autoFocus
                    />
                    <div className="overflow-y-auto flex-1">
                      {/* Default branch option */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBaseBranch("");
                          setShowBaseBranchSelector(false);
                          setBaseBranchSearch("");
                        }}
                        className="w-full text-left px-3 py-2 text-xs transition-colors"
                        style={{
                          backgroundColor: !selectedBaseBranch ? 'var(--bg-surface)' : 'transparent',
                          color: !selectedBaseBranch ? 'var(--accent-yellow)' : 'var(--text-secondary)',
                          borderBottom: '1px solid var(--border-default)',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = !selectedBaseBranch ? 'var(--bg-surface)' : 'transparent'}
                      >
                        <span style={{ color: 'var(--accent-yellow)' }}>○</span> Default branch (main/master)
                      </button>

                      {filteredBaseBranches.map((branch) => (
                        <button
                          type="button"
                          key={branch.name}
                          onClick={() => {
                            setSelectedBaseBranch(branch.name);
                            setShowBaseBranchSelector(false);
                            setBaseBranchSearch("");
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2"
                          style={{
                            backgroundColor: selectedBaseBranch === branch.name ? 'var(--bg-surface)' : 'transparent',
                            color: selectedBaseBranch === branch.name ? 'var(--accent-yellow)' : 'var(--text-secondary)',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = selectedBaseBranch === branch.name ? 'var(--bg-surface)' : 'transparent'}
                        >
                          <span className="truncate flex-1">{branch.name}</span>
                          {branch.is_current && (
                            <span style={{ color: 'var(--accent-green)' }}>*</span>
                          )}
                        </button>
                      ))}
                      {filteredBaseBranches.length === 0 && baseBranchSearch && (
                        <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                          No matching branches
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => handlePromptChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (prompt.startsWith("/") && repositoryPath) {
                    setShowNewTaskSlashCommands(true);
                  }
                }}
                onBlur={() => {
                  // Delay to allow click on command
                  setTimeout(() => setShowNewTaskSlashCommands(false), 150);
                }}
                placeholder={
                  repositoryPath
                    ? `Type / for commands, or describe the task... (${sendWithEnter ? "Enter" : "⌘+Enter"} to send)`
                    : "Select a repository first..."
                }
                disabled={!repositoryPath}
                rows={1}
                className="flex-1 px-4 py-3 text-xs resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
              <button
                type="submit"
                disabled={isSubmitting || !repositoryPath.trim() || !prompt.trim()}
                className="px-4 py-3 text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--accent-cyan)',
                  color: 'var(--bg-primary)',
                }}
              >
                {isSubmitting ? "..." : "RUN"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Existing task view
  const isRunning = task.status === "running";
  const isSettingUp = task.status === "idle" && output.length === 0;
  const statusCfg = statusConfig[task.status];

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <header className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              {editingTitle ? (
                <input
                  type="text"
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveTitle();
                    if (e.key === "Escape") setEditingTitle(false);
                  }}
                  autoFocus
                  className="text-sm font-medium px-1 -ml-1"
                  style={{
                    color: 'var(--text-primary)',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--accent-cyan)',
                    outline: 'none',
                  }}
                />
              ) : (
                <h2
                  className="text-sm font-medium cursor-pointer hover:underline"
                  style={{ color: 'var(--text-primary)' }}
                  onClick={startEditingTitle}
                  title="Click to edit"
                >
                  {task.name}
                </h2>
              )}
              <span className="text-xs" style={{ color: statusCfg.color }}>
                [{statusCfg.indicator}]
              </span>
            </div>
            <p className="text-xs mt-1 flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
              <span>{task.repository_path.split("/").pop()}</span>
              <span>•</span>
              <button
                onClick={handleCopyBranch}
                className="hover:underline cursor-pointer transition-colors"
                style={{ color: copiedBranch ? 'var(--accent-green)' : 'var(--text-secondary)' }}
                title="Click to copy"
              >
                {copiedBranch ? "Copied!" : task.branch}
              </button>
              {currentBaseBranch && (
                <>
                  <span style={{ color: 'var(--accent-yellow)' }}>↑</span>
                  <span
                    style={{ color: 'var(--text-dim)' }}
                    title={`Based on ${currentBaseBranch}`}
                  >
                    {currentBaseBranch}
                  </span>
                </>
              )}
              {task.total_cost_usd != null && task.total_cost_usd > 0 && (
                <>
                  <span>•</span>
                  <span title={`${(task.total_input_tokens ?? 0).toLocaleString()} in / ${(task.total_output_tokens ?? 0).toLocaleString()} out`}>
                    ${task.total_cost_usd.toFixed(4)}
                  </span>
                </>
              )}
            </p>
            {editingDescription ? (
              <textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                onBlur={saveDescription}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && e.metaKey) saveDescription();
                  if (e.key === "Escape") setEditingDescription(false);
                }}
                autoFocus
                rows={2}
                className="text-xs mt-2 max-w-xl w-full px-1 resize-none"
                style={{
                  color: 'var(--text-dim)',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--accent-cyan)',
                  outline: 'none',
                }}
                placeholder="Add a description..."
              />
            ) : (
              <p
                className="text-xs mt-2 max-w-xl cursor-pointer hover:underline"
                style={{ color: 'var(--text-dim)' }}
                onClick={startEditingDescription}
                title="Click to edit"
              >
                {task.description || "Click to add description..."}
              </p>
            )}
          </div>
          <div className="flex gap-2 ml-4">
            {isRunning && (
              <TerminalButton onClick={() => onStop(task.id)} color="yellow">
                STOP
              </TerminalButton>
            )}

            {/* Takeover/Handback */}
            {task.status !== "manual_control" ? (
              <TerminalButton
                onClick={async () => {
                  if (isTakingOver) return;

                  // Confirm before takeover
                  const confirmed = window.confirm(
                    `Take over this task?\n\n` +
                    `This will:\n` +
                    `• ${task.status === "running" ? "Stop Claude" : "Pause the task"}\n` +
                    `• Commit any uncommitted changes in the worktree\n` +
                    `• Stash any changes in your repo root\n` +
                    `• Checkout the task branch (${task.branch}) in your repo root\n\n` +
                    `You can then work on the code directly and hand back when done.`
                  );
                  if (!confirmed) return;

                  setIsTakingOver(true);
                  setTakeoverError(null);
                  try {
                    const result = await tauri.takeoverTask(task.id);
                    console.log("Takeover successful:", result);
                  } catch (err) {
                    console.error("Takeover failed:", err);
                    setTakeoverError(err instanceof Error ? err.message : "Takeover failed");
                  } finally {
                    setIsTakingOver(false);
                  }
                }}
                color="magenta"
                title="Take over control - work from repo root"
                disabled={isTakingOver}
              >
                {isTakingOver ? "TAKING OVER..." : "TAKEOVER"}
              </TerminalButton>
            ) : (
              <TerminalButton
                onClick={() => setIsHandbackModalOpen(true)}
                color="green"
                title="Commit changes and hand back to Claude"
              >
                HANDBACK
              </TerminalButton>
            )}
            {takeoverError && (
              <span className="text-xs" style={{ color: 'var(--accent-red)' }}>
                {takeoverError}
              </span>
            )}

            {/* Open In dropdown */}
            <div className="relative" ref={openInMenuRef}>
              <TerminalButton onClick={() => setOpenInMenuOpen(!openInMenuOpen)} color="cyan">
                OPEN IN ▼
              </TerminalButton>
              {openInMenuOpen && (
                <div
                  className="absolute top-full right-0 mt-1 min-w-[120px] z-50"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-active)',
                  }}
                >
                  <button
                    onClick={() => openInEditor('vscode')}
                    className="w-full px-3 py-2 text-xs text-left transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    VS Code
                  </button>
                  <button
                    onClick={() => openInEditor('cursor')}
                    className="w-full px-3 py-2 text-xs text-left transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    Cursor
                  </button>
                </div>
              )}
            </div>

            {/* View PR - only show if PR exists */}
            {task.pr_url && (
              <TerminalButton onClick={() => tauri.openPRInBrowser(task.pr_url!)} color="magenta">
                VIEW PR
              </TerminalButton>
            )}

            {/* More menu */}
            <div className="relative" ref={moreMenuRef}>
              <TerminalButton onClick={() => setMoreMenuOpen(!moreMenuOpen)} color="default">
                •••
              </TerminalButton>
              {moreMenuOpen && (
                <div
                  className="absolute top-full right-0 mt-1 min-w-[120px] z-50"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-active)',
                  }}
                >
                  <button
                    onClick={() => {
                      onDelete(task.id);
                      setMoreMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-xs text-left transition-colors"
                    style={{ color: 'var(--accent-red)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    Archive
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Manual Control Banner */}
      {task.status === "manual_control" && (
        <div
          className="px-6 py-3"
          style={{
            backgroundColor: 'rgba(255, 0, 255, 0.1)',
            borderBottom: '1px solid var(--accent-magenta)',
          }}
        >
          <div className="flex items-center gap-3">
            <span style={{ color: 'var(--accent-magenta)' }}>[M]</span>
            <div className="flex-1">
              <p className="text-xs" style={{ color: 'var(--accent-magenta)' }}>
                MANUAL CONTROL MODE
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                Claude paused. Make your changes in the worktree, then click TAKE BACK to resume.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Interrupted Banner */}
      {task.status === "interrupted" && (
        <div
          className="px-6 py-3"
          style={{
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            borderBottom: '1px solid var(--accent-orange, #f97316)',
          }}
        >
          <div className="flex items-center gap-3">
            <span style={{ color: 'var(--accent-orange, #f97316)' }}>[!]</span>
            <div className="flex-1">
              <p className="text-xs" style={{ color: 'var(--accent-orange, #f97316)' }}>
                TASK INTERRUPTED
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                This task was running when the app closed. Send a follow-up message below to continue where it left off.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {task.status === "error" && (
        <div
          className="px-6 py-3"
          style={{
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderBottom: '1px solid var(--accent-red)',
          }}
        >
          <div className="flex items-center gap-3">
            <span style={{ color: 'var(--accent-red)' }}>[E]</span>
            <div className="flex-1">
              <p className="text-xs" style={{ color: 'var(--accent-red)' }}>
                TASK FAILED
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--text-dim)' }}>
                The task encountered an error. Review the output below for details, or try restarting.
              </p>
            </div>
            <button
              onClick={() => onRestart(task.id)}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid var(--accent-red)',
                color: 'var(--accent-red)',
              }}
            >
              RETRY
            </button>
          </div>
        </div>
      )}

      {/* Activity Feed */}
      <ActivityFeed
        currentActivity={currentActivity}
        activeAgent={activeAgent}
        isRunning={isRunning}
      />

      {/* Main content - Chat on left, Changes on right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-6" ref={outputRef}>
            {/* Initial prompt */}
            <div className="mb-6">
              <div
                className="p-4"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderLeft: '2px solid var(--accent-cyan)',
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs" style={{ color: 'var(--accent-cyan)' }}>USER</span>
                  <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                    {new Date(task.created_at).toLocaleString()}
                  </span>
                </div>
                <div style={{ color: 'var(--text-primary)', fontSize: 'var(--font-xs)' }}>
                  {task.prompt}
                </div>
              </div>
            </div>

            {/* Setup indicator */}
            {isSettingUp && (
              <div className="flex items-center gap-3 py-4">
                <div className="flex gap-1">
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent-cyan)', animation: 'bounce 1s infinite', animationDelay: '0ms' }} />
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent-cyan)', animation: 'bounce 1s infinite', animationDelay: '150ms' }} />
                  <span className="w-2 h-2 rounded-full animate-bounce" style={{ backgroundColor: 'var(--accent-cyan)', animation: 'bounce 1s infinite', animationDelay: '300ms' }} />
                </div>
                <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                  Setting up worktree...
                </span>
              </div>
            )}

            {/* Output interleaved with follow-up messages */}
            {(() => {
              // Build segments: output sliced at follow-up boundaries
              const segments: { type: 'output' | 'followup'; outputSlice?: typeof output; message?: FollowUpMessage; isLast?: boolean }[] = [];

              if (followUpMessages.length === 0) {
                // No follow-ups: render all output as one segment
                if (output.length > 0 || isRunning) {
                  segments.push({ type: 'output', outputSlice: output, isLast: true });
                }
              } else {
                // Sort follow-ups by outputIndex to ensure correct ordering
                const sorted = [...followUpMessages].sort((a, b) => a.outputIndex - b.outputIndex);

                let lastIndex = 0;
                for (const msg of sorted) {
                  // Always add output segment before follow-up (even if empty for first segment)
                  const slice = output.slice(lastIndex, msg.outputIndex);
                  if (slice.length > 0 || lastIndex === 0) {
                    segments.push({ type: 'output', outputSlice: slice });
                  }
                  // The follow-up message itself
                  segments.push({ type: 'followup', message: msg });
                  lastIndex = msg.outputIndex;
                }

                // Remaining output after the last follow-up
                const remainingOutput = output.slice(lastIndex);
                if (remainingOutput.length > 0 || isRunning) {
                  segments.push({ type: 'output', outputSlice: remainingOutput, isLast: true });
                }
              }

              return segments.map((segment, idx) => {
                if (segment.type === 'output' && segment.outputSlice) {
                  return (
                    <div key={`output-${idx}`} className="overflow-x-auto">
                      <OutputRenderer
                        output={segment.outputSlice}
                        isRunning={segment.isLast ? isRunning : false}
                      />
                    </div>
                  );
                }
                if (segment.type === 'followup' && segment.message) {
                  const msg = segment.message;
                  return (
                    <div key={msg.id} className="mt-6">
                      <div
                        className="p-4"
                        style={{
                          backgroundColor: 'var(--bg-surface)',
                          borderLeft: '2px solid var(--accent-cyan)',
                        }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs" style={{ color: 'var(--accent-cyan)' }}>USER</span>
                          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                            {new Date(msg.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <div className="whitespace-pre-wrap" style={{ color: 'var(--text-primary)', fontSize: 'var(--font-xs)' }}>
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  );
                }
                return null;
              });
            })()}

            {/* Load more button */}
            {hasMore && !isRunning && (
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-default)' }}>
                <button
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="w-full py-2 text-xs transition-colors disabled:opacity-50"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-secondary)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoadingMore) {
                      e.currentTarget.style.borderColor = 'var(--accent-cyan)';
                      e.currentTarget.style.color = 'var(--accent-cyan)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  {isLoadingMore ? 'Loading...' : `Load more (${remainingCount} remaining)`}
                </button>
              </div>
            )}
          </div>

          {/* Permission request popover */}
          {permissionRequest && (
            <PermissionPopover
              key={permissionRequest.request_id}
              request={permissionRequest}
              onDismiss={() => dismissRequest(permissionRequest.request_id)}
            />
          )}

          {/* Follow-up input */}
          <div className="p-4 relative" style={{ borderTop: '1px solid var(--border-default)' }}>
            {/* Slash command suggestions */}
            {showSlashCommands && filteredCommands.length > 0 && (
              <div
                className="absolute bottom-full left-4 right-4 mb-1"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-active)',
                }}
              >
                {filteredCommands.map((cmd, index) => (
                  <button
                    key={cmd.command}
                    onClick={() => handleSelectCommand(cmd.command)}
                    className="w-full text-left px-3 py-2 flex items-center gap-3 transition-colors"
                    style={{
                      backgroundColor:
                        index === selectedCommandIndex
                          ? 'var(--bg-elevated)'
                          : 'transparent',
                    }}
                    onMouseEnter={() => setSelectedCommandIndex(index)}
                  >
                    <span
                      className="text-xs font-medium"
                      style={{ color: 'var(--accent-cyan)' }}
                    >
                      {cmd.command}
                    </span>
                    <span className="text-xs flex-1 truncate" style={{ color: 'var(--text-dim)' }}>
                      {cmd.description}
                    </span>
                    <span
                      className="text-xs px-1.5 py-0.5"
                      style={{
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-default)',
                        color: cmd.source === 'project' ? 'var(--accent-green)' :
                               cmd.source === 'global' ? 'var(--accent-yellow)' :
                               'var(--text-dim)',
                      }}
                    >
                      {cmd.source}
                    </span>
                  </button>
                ))}
                <div
                  className="px-3 py-1.5 text-xs flex items-center justify-between"
                  style={{
                    color: 'var(--text-dim)',
                    borderTop: '1px solid var(--border-default)',
                  }}
                >
                  <span>↑↓ navigate • Tab select • Esc close</span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      refreshSlashCommands();
                    }}
                    className="text-xs transition-colors"
                    style={{ color: 'var(--text-dim)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
                    title="Refresh commands"
                  >
                    [↻]
                  </button>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <textarea
                ref={followUpTextareaRef}
                value={followUpPrompt}
                onChange={(e) => handleFollowUpChange(e.target.value)}
                onKeyDown={handleFollowUpKeyDown}
                onFocus={() => {
                  if (followUpPrompt.startsWith("/")) {
                    setShowSlashCommands(true);
                  }
                }}
                onBlur={() => {
                  // Delay to allow click on command
                  setTimeout(() => setShowSlashCommands(false), 150);
                }}
                placeholder={
                  isRunning
                    ? "Task is running... click ■ to stop"
                    : `Type / for commands, or send a follow-up... (${sendWithEnter ? "Enter" : "⌘+Enter"} to send)`
                }
                disabled={isRunning}
                rows={1}
                className="flex-1 px-4 py-3 text-xs resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
              {isRunning ? (
                <button
                  onClick={() => onStop(task.id)}
                  className="px-4 py-3 text-xs font-medium transition-colors self-end"
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--accent-red)',
                    color: 'var(--accent-red)',
                  }}
                  title="Stop task"
                >
                  ■
                </button>
              ) : (
                <button
                  onClick={handleFollowUpSubmit}
                  disabled={!followUpPrompt.trim()}
                  className="px-4 py-3 text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed self-end"
                  style={{
                    backgroundColor: followUpPrompt.trim() ? 'var(--accent-cyan)' : 'var(--bg-surface)',
                    border: '1px solid var(--border-default)',
                    color: followUpPrompt.trim() ? 'var(--bg-primary)' : 'var(--text-dim)',
                  }}
                >
                  &gt;
                </button>
              )}
            </div>
            {/* Auto-accept edits toggle */}
            <div className="flex items-center gap-2 px-1 pt-1">
              <label
                className="flex items-center gap-1.5 text-xs cursor-pointer select-none"
                style={{ color: 'var(--text-dim)' }}
              >
                <input
                  type="checkbox"
                  checked={task.auto_accept_edits ?? false}
                  onChange={async (e) => {
                    const enabled = e.target.checked;
                    await tauri.setTaskAutoAcceptEdits(task.id, enabled);
                    if (onUpdateTask) onUpdateTask({ ...task, auto_accept_edits: enabled });
                  }}
                  className="accent-current"
                  style={{ accentColor: 'var(--accent-cyan)' }}
                />
                Auto-accept edits
              </label>
            </div>
          </div>
        </div>

        {/* Resizable Changes panel on the right */}
        <div
          className="flex-shrink-0 overflow-hidden relative"
          style={{
            width: changesPanelWidth,
            borderLeft: '1px solid var(--border-default)',
          }}
        >
          {/* Resize handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-10 transition-colors group flex items-center justify-center"
            style={{
              backgroundColor: isResizing ? 'var(--accent-cyan)' : 'transparent',
            }}
            onMouseDown={startResize}
            onMouseEnter={(e) => {
              if (!isResizing) e.currentTarget.style.backgroundColor = 'var(--border-active)';
            }}
            onMouseLeave={(e) => {
              if (!isResizing) e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            {/* Grip dots */}
            <div
              className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ pointerEvents: 'none' }}
            >
              <div className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--text-dim)' }} />
              <div className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--text-dim)' }} />
              <div className="w-1 h-1 rounded-full" style={{ backgroundColor: 'var(--text-dim)' }} />
            </div>
          </div>
          {/* Extended hit area for easier grabbing */}
          <div
            className="absolute left-0 top-0 bottom-0 w-3 cursor-col-resize z-9"
            style={{ transform: 'translateX(-50%)' }}
            onMouseDown={startResize}
          />
          <ChangesPanel
            taskId={task.id}
            onSendReview={(reviewPrompt) => {
              // Add as follow-up message for display
              const newMessage: FollowUpMessage = {
                id: crypto.randomUUID(),
                content: reviewPrompt,
                timestamp: new Date().toISOString(),
                outputIndex: output.length,
              };
              setFollowUpMessages((prev) => [...prev, newMessage]);
              onRestart(task.id, reviewPrompt);
            }}
            onFullScreen={() => setChangesPanelFullScreen(true)}
          />
        </div>
      </div>

      {/* Full-screen Changes panel */}
      {changesPanelFullScreen && (
        <div
          className="fixed inset-0 z-50 flex flex-col"
          style={{ backgroundColor: 'var(--bg-primary)' }}
        >
          <ChangesPanel
            taskId={task.id}
            onSendReview={(reviewPrompt) => {
              const newMessage: FollowUpMessage = {
                id: crypto.randomUUID(),
                content: reviewPrompt,
                timestamp: new Date().toISOString(),
                outputIndex: output.length,
              };
              setFollowUpMessages((prev) => [...prev, newMessage]);
              onRestart(task.id, reviewPrompt);
              setChangesPanelFullScreen(false);
            }}
            isFullScreen
            onExitFullScreen={() => setChangesPanelFullScreen(false)}
          />
        </div>
      )}

      {/* Handback Modal */}
      <HandbackModal
        task={task}
        isOpen={isHandbackModalOpen}
        onClose={() => setIsHandbackModalOpen(false)}
        onHandback={async (commitMessage, promptForClaude) => {
          await tauri.handbackTask(task.id, commitMessage, promptForClaude);
        }}
      />
    </div>
  );
}

// Terminal-style button component
function TerminalButton({
  children,
  onClick,
  disabled,
  color,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  color: "green" | "yellow" | "red" | "cyan" | "magenta" | "default";
  title?: string;
}) {
  const colorMap = {
    green: 'var(--accent-green)',
    yellow: 'var(--accent-yellow)',
    red: 'var(--accent-red)',
    cyan: 'var(--accent-cyan)',
    magenta: 'var(--accent-magenta)',
    default: 'var(--text-secondary)',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        backgroundColor: 'transparent',
        border: `1px solid ${disabled ? 'var(--border-default)' : colorMap[color]}`,
        color: disabled ? 'var(--text-dim)' : colorMap[color],
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = colorMap[color];
          e.currentTarget.style.color = 'var(--bg-primary)';
        }
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = 'transparent';
          e.currentTarget.style.color = colorMap[color];
        }
      }}
    >
      {children}
    </button>
  );
}

