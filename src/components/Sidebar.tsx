import { useState, useMemo, useRef, useEffect, RefObject } from "react";
import { Bell, Settings, Pencil, Plus, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import type { Task } from "../types/task";
import { TaskList } from "./TaskList";
import { usePermissions } from "../hooks/usePermissions";
import { formatShortcut, SHORTCUTS } from "../hooks/useKeyboardShortcuts";
import { useNotifications } from "../hooks/useNotifications";
import Logo from "../assets/logo.svg?react";

interface SidebarProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onNewTask: () => void;
  onOpenSettings: () => void;
  onArchiveTasks: (taskIds: string[]) => Promise<void>;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function Sidebar({
  tasks,
  selectedTaskId,
  onSelectTask,
  onNewTask,
  onOpenSettings,
  onArchiveTasks,
  searchInputRef,
  collapsed = false,
  onToggleCollapse,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [isArchiving, setIsArchiving] = useState(false);

  // Get all pending permissions to show indicators on tasks
  const { pendingTaskIds } = usePermissions();

  // Get notifications for badge count
  const { unreadCount } = useNotifications();

  // Get unique repos from tasks
  const repos = useMemo(() => {
    const repoSet = new Set<string>();
    tasks.forEach(task => {
      const repoName = task.repository_path.split('/').pop() || task.repository_path;
      repoSet.add(repoName);
    });
    return Array.from(repoSet).sort();
  }, [tasks]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredTasks = useMemo(() => {
    let result = tasks;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(task =>
        task.name.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        task.prompt.toLowerCase().includes(query) ||
        task.branch.toLowerCase().includes(query)
      );
    }

    // Filter by repository
    if (selectedRepos.size > 0) {
      result = result.filter(task => {
        const repoName = task.repository_path.split('/').pop() || task.repository_path;
        return selectedRepos.has(repoName);
      });
    }

    return result;
  }, [tasks, searchQuery, selectedRepos]);

  const toggleRepo = (repo: string) => {
    setSelectedRepos(prev => {
      const next = new Set(prev);
      if (next.has(repo)) {
        next.delete(repo);
      } else {
        next.add(repo);
      }
      return next;
    });
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedRepos(new Set());
  };

  const hasActiveFilters = searchQuery.trim() || selectedRepos.size > 0;

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const selectAllTasks = () => {
    setSelectedTaskIds(new Set(filteredTasks.map(t => t.id)));
  };

  const clearSelection = () => {
    setSelectedTaskIds(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedTaskIds(new Set());
  };

  const handleArchiveSelected = async () => {
    if (selectedTaskIds.size === 0) return;
    const confirmed = window.confirm(
      `Archive ${selectedTaskIds.size} task${selectedTaskIds.size > 1 ? 's' : ''}?\n\nThis will remove the associated worktrees and cannot be undone.`
    );
    if (!confirmed) return;

    setIsArchiving(true);
    try {
      await onArchiveTasks(Array.from(selectedTaskIds));
      exitSelectMode();
    } finally {
      setIsArchiving(false);
    }
  };

  const handleArchiveAll = async () => {
    if (filteredTasks.length === 0) return;
    const confirmed = window.confirm(
      `Archive all ${filteredTasks.length} task${filteredTasks.length > 1 ? 's' : ''}${selectedRepos.size > 0 ? ' in selected repos' : ''}?\n\nThis will remove the associated worktrees and cannot be undone.`
    );
    if (!confirmed) return;

    setIsArchiving(true);
    try {
      await onArchiveTasks(filteredTasks.map(t => t.id));
      exitSelectMode();
    } finally {
      setIsArchiving(false);
    }
  };

  // Collapsed sidebar view
  if (collapsed) {
    return (
      <aside
        className="w-[52px] h-screen flex flex-col transition-all duration-200"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-default)'
        }}
      >
        {/* Expand button */}
        <div className="p-2 flex justify-center" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <button
            onClick={onToggleCollapse}
            className="p-2 transition-colors"
            style={{ color: 'var(--text-dim)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
            title={`Expand sidebar (${formatShortcut(SHORTCUTS.toggleSidebar)})`}
          >
            <ChevronsRight size={16} strokeWidth={1} />
          </button>
        </div>

        {/* New task button */}
        <div className="p-2 flex justify-center">
          <button
            onClick={onNewTask}
            className="p-2 transition-colors"
            style={{ color: 'var(--accent-cyan)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            title={`New task (${formatShortcut(SHORTCUTS.newTask)})`}
          >
            <Plus size={16} strokeWidth={1} />
          </button>
        </div>

        {/* Task status indicators */}
        <div className="flex-1 overflow-y-auto py-1">
          {filteredTasks.map((task) => {
            const isSelected = task.id === selectedTaskId;
            const hasPendingPermission = pendingTaskIds.has(task.id);
            const statusColor = (() => {
              if (hasPendingPermission) return 'var(--accent-yellow)';
              switch (task.status) {
                case 'running': return 'var(--accent-green)';
                case 'waiting_input': return 'var(--accent-yellow)';
                case 'completed': return 'var(--text-secondary)';
                case 'error': return 'var(--accent-red)';
                case 'manual_control': return 'var(--accent-magenta)';
                case 'queued': return 'var(--accent-cyan)';
                default: return 'var(--text-dim)';
              }
            })();

            return (
              <button
                key={task.id}
                onClick={() => onSelectTask(task.id)}
                className="w-full p-2 flex justify-center transition-colors"
                style={{
                  backgroundColor: isSelected ? 'var(--bg-elevated)' : 'transparent',
                  borderLeft: isSelected ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title={task.name}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: statusColor }}
                />
              </button>
            );
          })}
        </div>

        {/* Footer icons */}
        <div className="p-2 flex justify-center gap-1" style={{ borderTop: '1px solid var(--border-default)' }}>
          <button
            onClick={onOpenSettings}
            className="p-2 transition-colors"
            style={{ color: 'var(--text-dim)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
            title={`Settings (${formatShortcut(SHORTCUTS.settings)})`}
          >
            <Settings size={16} strokeWidth={1} />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[280px] h-screen flex flex-col transition-all duration-200" style={{
      backgroundColor: 'var(--bg-surface)',
      borderRight: '1px solid var(--border-default)'
    }}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-primary)' }}>
        <Logo className="h-5 w-auto" />
        <button
          onClick={onToggleCollapse}
          className="p-1 transition-colors"
          style={{ color: 'var(--text-dim)' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
          title={`Collapse sidebar (${formatShortcut(SHORTCUTS.toggleSidebar)})`}
        >
          <ChevronsLeft size={16} strokeWidth={1} />
        </button>
      </div>

      {/* Controls */}
      <div className="p-3 space-y-2">
        {/* New Task Button */}
        <button
          onClick={onNewTask}
          className="w-full px-4 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-2"
          style={{
            backgroundColor: 'transparent',
            border: '1px solid var(--border-active)',
            color: 'var(--text-primary)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent-cyan)';
            e.currentTarget.style.color = 'var(--accent-cyan)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-active)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          title={`New task (${formatShortcut(SHORTCUTS.newTask)})`}
        >
          <Plus size={14} strokeWidth={1} style={{ color: 'var(--accent-cyan)' }} />
          NEW TASK
        </button>

        {/* Search Input */}
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search... (${formatShortcut(SHORTCUTS.focusSearch)})`}
            className="w-full px-3 py-2 text-xs"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: `1px solid ${searchQuery ? 'var(--accent-cyan)' : 'var(--border-default)'}`,
              color: 'var(--text-primary)',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 transition-colors"
              style={{ color: 'var(--text-dim)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
            >
              <X size={14} strokeWidth={1} />
            </button>
          )}
        </div>

        {/* Repo Filter Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full px-3 py-2 text-xs text-left flex items-center justify-between"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: `1px solid ${selectedRepos.size > 0 ? 'var(--accent-cyan)' : 'var(--border-default)'}`,
              color: selectedRepos.size > 0 ? 'var(--text-primary)' : 'var(--text-dim)',
            }}
          >
            <span className="truncate">
              {selectedRepos.size === 0
                ? 'All repositories'
                : selectedRepos.size === 1
                  ? Array.from(selectedRepos)[0]
                  : `${selectedRepos.size} repos selected`}
            </span>
            <span style={{ color: 'var(--text-dim)' }}>{dropdownOpen ? '▲' : '▼'}</span>
          </button>

          {dropdownOpen && (
            <div
              className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto z-50"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-active)',
              }}
            >
              {repos.map(repo => (
                <label
                  key={repo}
                  className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <input
                    type="checkbox"
                    checked={selectedRepos.has(repo)}
                    onChange={() => toggleRepo(repo)}
                    className="accent-cyan-400"
                  />
                  <span className="truncate">{repo}</span>
                </label>
              ))}
              {repos.length === 0 && (
                <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                  No repositories
                </div>
              )}
            </div>
          )}
        </div>

        {/* Clear all filters button */}
        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="w-full px-3 py-1.5 text-xs transition-colors"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid var(--border-default)',
              color: 'var(--text-dim)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-red)';
              e.currentTarget.style.color = 'var(--accent-red)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-default)';
              e.currentTarget.style.color = 'var(--text-dim)';
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Task count */}
      {hasActiveFilters && (
        <div
          className="px-3 pb-2 text-xs"
          style={{ color: 'var(--text-dim)' }}
        >
          {filteredTasks.length} of {tasks.length} tasks
        </div>
      )}

      {/* Select mode action bar */}
      {selectMode && (
        <div
          className="px-3 py-2 flex items-center gap-2 flex-wrap"
          style={{ borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <button
            onClick={selectAllTasks}
            className="text-xs transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            Select All
          </button>
          <span style={{ color: 'var(--text-dim)' }}>|</span>
          <button
            onClick={clearSelection}
            className="text-xs transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            Clear
          </button>
          <span style={{ color: 'var(--text-dim)' }}>|</span>
          <button
            onClick={exitSelectMode}
            className="text-xs transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            Cancel
          </button>
          <div className="flex-1" />
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
            {selectedTaskIds.size} selected
          </span>
        </div>
      )}

      {/* Task List */}
      <div className="flex-1 overflow-y-auto">
        <TaskList
          tasks={filteredTasks}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectTask}
          pendingPermissionTaskIds={pendingTaskIds}
          onArchiveTask={async (taskId) => {
            const task = tasks.find(t => t.id === taskId);
            const confirmed = window.confirm(
              `Archive "${task?.name || 'this task'}"?\n\nThis will remove the associated worktree and cannot be undone.`
            );
            if (confirmed) {
              await onArchiveTasks([taskId]);
            }
          }}
          selectMode={selectMode}
          selectedTaskIds={selectedTaskIds}
          onToggleTaskSelection={toggleTaskSelection}
        />
      </div>

      {/* Bulk action buttons when in select mode */}
      {selectMode && (
        <div
          className="p-3 space-y-2"
          style={{ borderTop: '1px solid var(--border-default)' }}
        >
          <button
            onClick={handleArchiveSelected}
            disabled={selectedTaskIds.size === 0 || isArchiving}
            className="w-full px-4 py-2 text-xs font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid var(--accent-red)',
              color: 'var(--accent-red)',
            }}
          >
            {isArchiving ? 'ARCHIVING...' : `ARCHIVE SELECTED (${selectedTaskIds.size})`}
          </button>
          <button
            onClick={handleArchiveAll}
            disabled={filteredTasks.length === 0 || isArchiving}
            className="w-full px-4 py-2 text-xs font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid var(--border-default)',
              color: 'var(--text-dim)',
            }}
          >
            ARCHIVE ALL ({filteredTasks.length})
          </button>
        </div>
      )}

      {/* Footer: compact icon buttons */}
      <div
        className="px-3 py-2 flex items-center justify-center gap-2"
        style={{ borderTop: '1px solid var(--border-default)' }}
      >
        {/* Notifications */}
        <button
          className="relative p-2 transition-colors"
          style={{ color: 'var(--text-dim)' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
          title="Notifications"
        >
          <Bell size={18} strokeWidth={1} />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-medium"
              style={{
                backgroundColor: 'var(--accent-red)',
                color: 'var(--bg-primary)',
                borderRadius: '8px',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* Edit/Select mode */}
        {tasks.length > 0 && (
          <button
            onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
            className="p-2 transition-colors"
            style={{ color: selectMode ? 'var(--accent-cyan)' : 'var(--text-dim)' }}
            onMouseEnter={(e) => {
              if (!selectMode) e.currentTarget.style.color = 'var(--text-secondary)';
            }}
            onMouseLeave={(e) => {
              if (!selectMode) e.currentTarget.style.color = 'var(--text-dim)';
            }}
            title={selectMode ? "Exit edit mode" : "Edit tasks"}
          >
            <Pencil size={18} strokeWidth={1} />
          </button>
        )}

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="p-2 transition-colors"
          style={{ color: 'var(--text-dim)' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
          title={`Settings (${formatShortcut(SHORTCUTS.settings)})`}
        >
          <Settings size={18} strokeWidth={1} />
        </button>
      </div>
    </aside>
  );
}
