import { useState, useRef, useEffect, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Menu } from "@base-ui/react/menu";
import { Send, Square, ArrowUp, ArrowDown, RefreshCw, Hand, Undo2, FolderOpen, GitPullRequest, MoreVertical } from "lucide-react";
import { Button } from "./Button";
import type { Task } from "../types/task";
import { useTaskOutput } from "../hooks/useTaskOutput";
import { usePermissions } from "../hooks/usePermissions";
import { useSlashCommands } from "../hooks/useSlashCommands";
import { ChangesPanel } from "./ChangesPanel";
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
  const [editedTitle, setEditedTitle] = useState("");
  const [copiedBranch, setCopiedBranch] = useState(false);
  const [isHandbackModalOpen, setIsHandbackModalOpen] = useState(false);
  const [isTakingOver, setIsTakingOver] = useState(false);
  const [changesPanelWidth, setChangesPanelWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const followUpTextareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const slashCommandsRef = useRef<HTMLDivElement>(null);
  const newTaskSlashCommandsRef = useRef<HTMLDivElement>(null);

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
        const newIndex = newTaskSelectedCommandIndex < filteredNewTaskCommands.length - 1
          ? newTaskSelectedCommandIndex + 1 : 0;
        setNewTaskSelectedCommandIndex(newIndex);
        // Scroll into view
        const container = newTaskSlashCommandsRef.current;
        const item = container?.querySelector(`[data-index="${newIndex}"]`);
        item?.scrollIntoView({ block: 'nearest' });
        return;
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const newIndex = newTaskSelectedCommandIndex > 0
          ? newTaskSelectedCommandIndex - 1 : filteredNewTaskCommands.length - 1;
        setNewTaskSelectedCommandIndex(newIndex);
        // Scroll into view
        const container = newTaskSlashCommandsRef.current;
        const item = container?.querySelector(`[data-index="${newIndex}"]`);
        item?.scrollIntoView({ block: 'nearest' });
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
        const newIndex = selectedCommandIndex < filteredCommands.length - 1
          ? selectedCommandIndex + 1 : 0;
        setSelectedCommandIndex(newIndex);
        // Scroll into view
        const container = slashCommandsRef.current;
        const item = container?.querySelector(`[data-index="${newIndex}"]`);
        item?.scrollIntoView({ block: 'nearest' });
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const newIndex = selectedCommandIndex > 0
          ? selectedCommandIndex - 1 : filteredCommands.length - 1;
        setSelectedCommandIndex(newIndex);
        // Scroll into view
        const container = slashCommandsRef.current;
        const item = container?.querySelector(`[data-index="${newIndex}"]`);
        item?.scrollIntoView({ block: 'nearest' });
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

  // Clear follow-up messages when task changes
  useEffect(() => {
    setFollowUpMessages([]);
  }, [task?.id]);

  // New task view
  if (!task) {
    return (
      <div className="flex-1 flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
        <header className="px-6 py-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>New task</h2>
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
                      borderRadius: 'var(--border-radius)',
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
              ref={newTaskSlashCommandsRef}
              className="absolute bottom-full left-4 right-4 mb-1 flex flex-col"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-active)',
                borderRadius: 'var(--border-radius)',
                zIndex: 'var(--z-dropdown)',
                maxHeight: '240px',
              }}
            >
              <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredNewTaskCommands.map((cmd, index) => (
                <button
                  key={cmd.command}
                  data-index={index}
                  onClick={() => handleSelectNewTaskCommand(cmd.command)}
                  className="w-full text-left px-3 py-2 flex items-center gap-3 transition-colors"
                  style={{
                    backgroundColor:
                      index === newTaskSelectedCommandIndex
                        ? 'var(--bg-surface)'
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
                      borderRadius: 'var(--border-radius)',
                      color: cmd.source === 'project' ? 'var(--accent-green)' :
                             cmd.source === 'global' ? 'var(--accent-yellow)' :
                             'var(--text-dim)',
                    }}
                  >
                    {cmd.source}
                  </span>
                </button>
              ))}
              </div>
              <div
                className="flex items-center justify-between"
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  fontSize: '12px',
                  color: 'var(--text-dim)',
                  borderTop: '1px solid var(--border-default)',
                }}
              >
                <span className="flex items-center gap-1">
                  <ArrowUp size={12} strokeWidth={1.5} />
                  <ArrowDown size={12} strokeWidth={1.5} />
                  <span>navigate • Tab select • Esc close</span>
                </span>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    refreshNewTaskSlashCommands();
                  }}
                  className="transition-colors"
                  style={{ color: 'var(--text-dim)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
                  title="Refresh commands"
                >
                  <RefreshCw size={12} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={handleBrowse}
                className="flex items-center gap-2"
              >
                <span style={{ color: 'var(--accent-cyan)' }}>[...]</span>
                BROWSE OTHER
              </Button>
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
                    borderRadius: 'var(--border-radius)',
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
                      borderRadius: 'var(--border-radius)',
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
                    borderRadius: 'var(--border-radius)',
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
                      borderRadius: 'var(--border-radius)',
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

            {/* Floating input container */}
            <div
              className="p-3"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--border-radius)',
              }}
            >
              {/* Textarea on top */}
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
                className="w-full text-xs resize-none bg-transparent border-none outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  color: 'var(--text-primary)',
                }}
              />
              {/* Button row: send on right */}
              <div className="flex justify-end mt-2">
                <Button
                  type="submit"
                  variant={(!isSubmitting && repositoryPath.trim() && prompt.trim()) ? "primary" : "ghost"}
                  size="icon"
                  disabled={isSubmitting || !repositoryPath.trim() || !prompt.trim()}
                  title="Start task"
                >
                  {isSubmitting ? (
                    <span className="inline-block w-4 h-4 text-center">...</span>
                  ) : (
                    <Send size={16} strokeWidth={1.5} />
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // Existing task view
  const isRunning = task.status === "running";
  const isSettingUp = task.status === "idle" && output.length === 0;

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <header
        className="flex items-center justify-between"
        style={{
          padding: 'var(--space-3) var(--space-4)',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        {/* Left: Title and metadata inline */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Title */}
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
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-primary)',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--accent-cyan)',
                borderRadius: 'var(--border-radius)',
                outline: 'none',
                padding: '2px var(--space-2)',
              }}
            />
          ) : (
            <h2
              className="cursor-pointer hover:underline truncate"
              style={{
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--text-primary)',
              }}
              onClick={startEditingTitle}
              title="Click to edit"
            >
              {task.name}
            </h2>
          )}

          {/* Separator */}
          <span style={{ color: 'var(--text-dim)' }}>•</span>

          {/* Repo */}
          <span
            className="text-xs truncate"
            style={{ color: 'var(--text-secondary)' }}
          >
            {task.repository_path.split("/").pop()}
          </span>

          {/* Separator */}
          <span style={{ color: 'var(--text-dim)' }}>•</span>

          {/* Branch (clickable to copy) */}
          <button
            onClick={handleCopyBranch}
            className="text-xs hover:underline cursor-pointer transition-colors truncate max-w-[200px]"
            style={{ color: copiedBranch ? 'var(--accent-green)' : 'var(--text-secondary)' }}
            title="Click to copy branch name"
          >
            {copiedBranch ? "Copied!" : task.branch}
          </button>

          {/* Base branch */}
          {currentBaseBranch && (
            <>
              <span style={{ color: 'var(--accent-yellow)' }}>↑</span>
              <span
                className="text-xs truncate max-w-[120px]"
                style={{ color: 'var(--text-dim)' }}
                title={`Based on ${currentBaseBranch}`}
              >
                {currentBaseBranch}
              </span>
            </>
          )}
        </div>

        {/* Right: Action buttons */}
        <div className="flex items-center" style={{ gap: 'var(--space-2)' }}>
          {/* Takeover/Handback */}
          {task.status !== "manual_control" ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                if (isTakingOver) return;

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
                try {
                  const result = await tauri.takeoverTask(task.id);
                  console.log("Takeover successful:", result);
                } catch (err) {
                  console.error("Takeover failed:", err);
                  // Could show a toast notification here
                } finally {
                  setIsTakingOver(false);
                }
              }}
              title="Takeover - work from repo root"
              disabled={isTakingOver}
            >
              <Hand size={16} strokeWidth={1.5} />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsHandbackModalOpen(true)}
              title="Handback - commit and return to Claude"
              style={{ color: 'var(--accent-green)' }}
            >
              <Undo2 size={16} strokeWidth={1.5} />
            </Button>
          )}

          {/* Open In dropdown */}
          <Menu.Root>
            <Menu.Trigger
              className="btn-ghost btn-icon transition-colors"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: 'var(--border-radius)',
                color: 'var(--text-dim)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-dim)';
              }}
              title="Open in editor"
            >
              <FolderOpen size={16} strokeWidth={1.5} />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="end" sideOffset={4}>
                <Menu.Popup
                  style={{
                    minWidth: '120px',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-active)',
                    borderRadius: 'var(--border-radius)',
                    padding: 'var(--space-1) 0',
                    zIndex: 'var(--z-dropdown)',
                  }}
                >
                  <Menu.Item
                    onClick={() => openInEditor('vscode')}
                    className="w-full text-left transition-colors cursor-pointer outline-none data-[highlighted]:bg-[var(--bg-surface)]"
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    VS Code
                  </Menu.Item>
                  <Menu.Item
                    onClick={() => openInEditor('cursor')}
                    className="w-full text-left transition-colors cursor-pointer outline-none data-[highlighted]:bg-[var(--bg-surface)]"
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    Cursor
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>

          {/* View PR - only show if PR exists */}
          {task.pr_url && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => tauri.openPRInBrowser(task.pr_url!)}
              title="View Pull Request"
              style={{ color: 'var(--accent-green)' }}
            >
              <GitPullRequest size={16} strokeWidth={1.5} />
            </Button>
          )}

          {/* More menu */}
          <Menu.Root>
            <Menu.Trigger
              className="btn-ghost btn-icon transition-colors"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '32px',
                height: '32px',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: 'var(--border-radius)',
                color: 'var(--text-dim)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-dim)';
              }}
              title="More options"
            >
              <MoreVertical size={16} strokeWidth={1.5} />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="end" sideOffset={4}>
                <Menu.Popup
                  style={{
                    minWidth: '120px',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-active)',
                    borderRadius: 'var(--border-radius)',
                    padding: 'var(--space-1) 0',
                    zIndex: 'var(--z-dropdown)',
                  }}
                >
                  <Menu.Item
                    onClick={() => onDelete(task.id)}
                    className="w-full text-left transition-colors cursor-pointer outline-none data-[highlighted]:bg-[var(--bg-surface)]"
                    style={{
                      padding: 'var(--space-2) var(--space-3)',
                      fontSize: '12px',
                      color: 'var(--accent-red)',
                    }}
                  >
                    Archive
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </div>
      </header>

      {/* Manual Control Banner */}
      {task.status === "manual_control" && (
        <div
          className="px-6 py-3"
          style={{
            backgroundColor: 'var(--bg-accent-subtle)',
            borderBottom: '1px solid var(--accent-cyan)',
          }}
        >
          <div className="flex items-center gap-3">
            <span style={{ color: 'var(--accent-cyan)' }}>[M]</span>
            <div className="flex-1">
              <p className="text-xs" style={{ color: 'var(--accent-cyan)' }}>
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
            backgroundColor: 'var(--bg-warning-subtle)',
            borderBottom: '1px solid var(--accent-yellow)',
          }}
        >
          <div className="flex items-center gap-3">
            <span style={{ color: 'var(--accent-yellow)' }}>[!]</span>
            <div className="flex-1">
              <p className="text-xs" style={{ color: 'var(--accent-yellow)' }}>
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
            <Button variant="secondary" color="red" onClick={() => onRestart(task.id)}>
              RETRY
            </Button>
          </div>
        </div>
      )}

      {/* Main content - Chat on left, Changes on right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto p-6" ref={outputRef}>
            {/* Initial prompt */}
            <div className="mb-6">
              <div
                className="p-3 inline-block max-w-[85%]"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  borderRadius: 'var(--border-radius)',
                }}
              >
                <div className="whitespace-pre-wrap text-xs" style={{ color: 'var(--text-primary)' }}>
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
                        repositoryPath={task.repository_path}
                      />
                    </div>
                  );
                }
                if (segment.type === 'followup' && segment.message) {
                  const msg = segment.message;
                  return (
                    <div key={msg.id} className="mt-6">
                      <div
                        className="p-3 inline-block max-w-[85%]"
                        style={{
                          backgroundColor: 'var(--bg-elevated)',
                          borderRadius: 'var(--border-radius)',
                        }}
                      >
                        <div className="whitespace-pre-wrap text-xs" style={{ color: 'var(--text-primary)' }}>
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
                <Button
                  variant="ghost"
                  onClick={loadMore}
                  disabled={isLoadingMore}
                  className="w-full"
                >
                  {isLoadingMore ? 'Loading...' : `Load more (${remainingCount} remaining)`}
                </Button>
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

          {/* Follow-up input - floating box */}
          <div className="p-4 relative">
            {/* Slash command suggestions */}
            {showSlashCommands && filteredCommands.length > 0 && (
              <div
                ref={slashCommandsRef}
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 'var(--space-4)',
                  right: 'var(--space-4)',
                  marginBottom: 'var(--space-1)',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-active)',
                  borderRadius: 'var(--border-radius)',
                  zIndex: 'var(--z-dropdown)',
                  maxHeight: '240px',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {filteredCommands.map((cmd, index) => (
                    <button
                      key={cmd.command}
                      data-index={index}
                      onClick={() => handleSelectCommand(cmd.command)}
                      className="w-full text-left transition-colors"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-2) var(--space-3)',
                        backgroundColor:
                          index === selectedCommandIndex
                            ? 'var(--bg-surface)'
                            : 'transparent',
                      }}
                      onMouseEnter={() => setSelectedCommandIndex(index)}
                    >
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: 'var(--accent-cyan)',
                        }}
                      >
                        {cmd.command}
                      </span>
                      <span
                        style={{
                          fontSize: '12px',
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          color: 'var(--text-dim)',
                        }}
                      >
                        {cmd.description}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px var(--space-1)',
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--border-radius)',
                          color: cmd.source === 'project' ? 'var(--accent-green)' :
                                 cmd.source === 'global' ? 'var(--accent-yellow)' :
                                 'var(--text-dim)',
                        }}
                      >
                        {cmd.source}
                      </span>
                    </button>
                  ))}
                </div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: 'var(--space-2) var(--space-3)',
                    fontSize: '12px',
                    color: 'var(--text-dim)',
                    borderTop: '1px solid var(--border-default)',
                  }}
                >
                  <span className="flex items-center gap-1">
                    <ArrowUp size={12} strokeWidth={1.5} />
                    <ArrowDown size={12} strokeWidth={1.5} />
                    <span>navigate • Tab select • Esc close</span>
                  </span>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      refreshSlashCommands();
                    }}
                    className="transition-colors"
                    style={{ color: 'var(--text-dim)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
                    title="Refresh commands"
                  >
                    <RefreshCw size={12} strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            )}

            {/* Floating input container */}
            <div
              className="p-3"
              style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--border-radius)',
              }}
            >
              {/* Textarea on top */}
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
                    ? "Task is running..."
                    : `Type / for commands, or send a follow-up... (${sendWithEnter ? "Enter" : "⌘+Enter"} to send)`
                }
                disabled={isRunning}
                rows={1}
                className="w-full text-xs resize-none bg-transparent border-none outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  color: 'var(--text-primary)',
                }}
              />
              {/* Buttons row: accept edits toggle on left, send/stop on right */}
              <div className="flex items-center justify-between mt-2">
                {/* Accept edits toggle button on left */}
                <Button
                  variant="ghost"
                  active={task.auto_accept_edits ?? false}
                  onClick={async () => {
                    const newValue = !(task.auto_accept_edits ?? false);
                    await tauri.setTaskAutoAcceptEdits(task.id, newValue);
                    if (onUpdateTask) onUpdateTask({ ...task, auto_accept_edits: newValue });
                  }}
                >
                  Accept edits
                </Button>
                {/* Send/Stop button on right */}
                {isRunning ? (
                  <Button
                    variant="secondary"
                    color="red"
                    size="icon"
                    onClick={() => onStop(task.id)}
                    title="Stop task"
                  >
                    <Square size={16} strokeWidth={1.5} fill="currentColor" />
                  </Button>
                ) : (
                  <Button
                    variant={followUpPrompt.trim() ? "primary" : "ghost"}
                    size="icon"
                    onClick={handleFollowUpSubmit}
                    disabled={!followUpPrompt.trim()}
                    title="Send message"
                  >
                    <Send size={16} strokeWidth={1.5} />
                  </Button>
                )}
              </div>
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
          />
        </div>
      </div>

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


