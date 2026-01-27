import { useState, useMemo, useRef, useEffect, RefObject } from "react";
import type { Task, TaskStatus } from "../types/task";
import { TaskList } from "./TaskList";
import { usePermissions } from "../hooks/usePermissions";
import { formatShortcut, SHORTCUTS } from "../hooks/useKeyboardShortcuts";
import Logo from "../assets/logo.svg?react";

type SortOption = "date_desc" | "date_asc" | "name_asc" | "name_desc" | "status";

interface SidebarProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onNewTask: () => void;
  onOpenSettings: () => void;
  onArchiveTasks: (taskIds: string[]) => Promise<void>;
  searchInputRef?: RefObject<HTMLInputElement | null>;
}

export function Sidebar({
  tasks,
  selectedTaskId,
  onSelectTask,
  onNewTask,
  onOpenSettings,
  onArchiveTasks,
  searchInputRef,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<TaskStatus>>(new Set());
  const [sortBy, setSortBy] = useState<SortOption>("date_desc");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const sortDropdownRef = useRef<HTMLDivElement>(null);

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [isArchiving, setIsArchiving] = useState(false);

  // Get all pending permissions to show indicators on tasks
  const { pendingTaskIds } = usePermissions();

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
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) {
        setStatusDropdownOpen(false);
      }
      if (sortDropdownRef.current && !sortDropdownRef.current.contains(e.target as Node)) {
        setSortDropdownOpen(false);
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

    // Filter by status
    if (selectedStatuses.size > 0) {
      result = result.filter(task => selectedStatuses.has(task.status));
    }

    // Sort
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case "date_desc":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "date_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "name_asc":
          return a.name.localeCompare(b.name);
        case "name_desc":
          return b.name.localeCompare(a.name);
        case "status":
          return a.status.localeCompare(b.status);
        default:
          return 0;
      }
    });

    return result;
  }, [tasks, searchQuery, selectedRepos, selectedStatuses, sortBy]);

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

  const toggleStatus = (status: TaskStatus) => {
    setSelectedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedRepos(new Set());
    setSelectedStatuses(new Set());
  };

  const hasActiveFilters = searchQuery.trim() || selectedRepos.size > 0 || selectedStatuses.size > 0;

  const statusOptions: { value: TaskStatus; label: string; color: string }[] = [
    { value: "running", label: "Running", color: "var(--accent-green)" },
    { value: "waiting_input", label: "Waiting", color: "var(--accent-yellow)" },
    { value: "completed", label: "Completed", color: "var(--text-secondary)" },
    { value: "error", label: "Error", color: "var(--accent-red)" },
    { value: "idle", label: "Idle", color: "var(--text-dim)" },
    { value: "manual_control", label: "Manual", color: "var(--accent-magenta)" },
    { value: "interrupted", label: "Interrupted", color: "var(--accent-orange, #f97316)" },
  ];

  const sortOptions: { value: SortOption; label: string }[] = [
    { value: "date_desc", label: "Newest first" },
    { value: "date_asc", label: "Oldest first" },
    { value: "name_asc", label: "Name A-Z" },
    { value: "name_desc", label: "Name Z-A" },
    { value: "status", label: "By status" },
  ];

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

  return (
    <aside className="w-[280px] h-screen flex flex-col" style={{
      backgroundColor: 'var(--bg-surface)',
      borderRight: '1px solid var(--border-default)'
    }}>
      <div className="p-4" style={{ borderBottom: '1px solid var(--border-default)', color: 'var(--text-primary)' }}>
        <Logo className="h-5 w-auto" />
      </div>

      <div className="p-3 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={onNewTask}
            className="flex-1 px-4 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-2"
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
            <span style={{ color: 'var(--accent-cyan)' }}>+</span>
            NEW TASK
          </button>
          {!selectMode && tasks.length > 0 && (
            <button
              onClick={() => setSelectMode(true)}
              className="px-3 py-2 text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid var(--border-default)',
                color: 'var(--text-dim)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-active)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
                e.currentTarget.style.color = 'var(--text-dim)';
              }}
              title="Select multiple tasks to archive"
            >
              EDIT
            </button>
          )}
        </div>

        {/* Search Input */}
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search tasks... (${formatShortcut(SHORTCUTS.focusSearch)})`}
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
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs transition-colors"
              style={{ color: 'var(--text-dim)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
            >
              [x]
            </button>
          )}
        </div>

        {/* Filter Row */}
        <div className="flex gap-2">
          {/* Status Filter Dropdown */}
          <div className="flex-1 relative" ref={statusDropdownRef}>
            <button
              onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
              className="w-full px-2 py-1.5 text-xs text-left flex items-center justify-between"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: `1px solid ${selectedStatuses.size > 0 ? 'var(--accent-cyan)' : 'var(--border-default)'}`,
                color: selectedStatuses.size > 0 ? 'var(--text-primary)' : 'var(--text-dim)',
              }}
            >
              <span className="truncate">
                {selectedStatuses.size === 0
                  ? 'Status'
                  : selectedStatuses.size === 1
                    ? statusOptions.find(s => s.value === Array.from(selectedStatuses)[0])?.label
                    : `${selectedStatuses.size} statuses`}
              </span>
              <span style={{ color: 'var(--text-dim)' }}>{statusDropdownOpen ? '▲' : '▼'}</span>
            </button>

            {statusDropdownOpen && (
              <div
                className="absolute top-full left-0 right-0 mt-1 z-50"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-active)',
                }}
              >
                {statusOptions.map(status => (
                  <label
                    key={status.value}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <input
                      type="checkbox"
                      checked={selectedStatuses.has(status.value)}
                      onChange={() => toggleStatus(status.value)}
                      className="accent-cyan-400"
                    />
                    <span style={{ color: status.color }}>{status.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Sort Dropdown */}
          <div className="relative" ref={sortDropdownRef}>
            <button
              onClick={() => setSortDropdownOpen(!sortDropdownOpen)}
              className="px-2 py-1.5 text-xs flex items-center gap-1"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-dim)',
              }}
              title="Sort tasks"
            >
              <span>↕</span>
              <span>{sortDropdownOpen ? '▲' : '▼'}</span>
            </button>

            {sortDropdownOpen && (
              <div
                className="absolute top-full right-0 mt-1 min-w-[120px] z-50"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-active)',
                }}
              >
                {sortOptions.map(option => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setSortBy(option.value);
                      setSortDropdownOpen(false);
                    }}
                    className="w-full px-3 py-1.5 text-xs text-left transition-colors"
                    style={{
                      color: sortBy === option.value ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                      backgroundColor: sortBy === option.value ? 'var(--bg-surface)' : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (sortBy !== option.value) e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
                    }}
                    onMouseLeave={(e) => {
                      if (sortBy !== option.value) e.currentTarget.style.backgroundColor = 'transparent';
                    }}
                  >
                    {sortBy === option.value ? '✓ ' : '  '}{option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
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
            Clear all filters
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

      <div className="flex-1 overflow-y-auto">
        <TaskList
          tasks={filteredTasks}
          selectedTaskId={selectedTaskId}
          onSelectTask={onSelectTask}
          pendingPermissionTaskIds={pendingTaskIds}
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

      {/* Settings button */}
      <div className="p-3" style={{ borderTop: '1px solid var(--border-default)' }}>
        <button
          onClick={onOpenSettings}
          className="w-full px-4 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-2"
          style={{
            backgroundColor: 'transparent',
            border: '1px solid var(--border-default)',
            color: 'var(--text-dim)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-active)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-default)';
            e.currentTarget.style.color = 'var(--text-dim)';
          }}
          title={`Settings (${formatShortcut(SHORTCUTS.settings)})`}
        >
          [*] SETTINGS
        </button>
      </div>
    </aside>
  );
}
