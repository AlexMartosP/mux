import { useState, useMemo, useRef, useEffect } from "react";
import type { Task } from "../types/task";
import { TaskList } from "./TaskList";
import { usePermissions } from "../hooks/usePermissions";
import Logo from "../assets/logo.svg?react";

interface SidebarProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  onNewTask: () => void;
  onOpenSettings: () => void;
  onArchiveTasks: (taskIds: string[]) => Promise<void>;
}

export function Sidebar({
  tasks,
  selectedTaskId,
  onSelectTask,
  onNewTask,
  onOpenSettings,
  onArchiveTasks,
}: SidebarProps) {
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown when clicking outside
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
    if (selectedRepos.size === 0) return tasks;

    return tasks.filter(task => {
      const repoName = task.repository_path.split('/').pop() || task.repository_path;
      return selectedRepos.has(repoName);
    });
  }, [tasks, selectedRepos]);

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

  const clearFilter = () => {
    setSelectedRepos(new Set());
  };

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

          {selectedRepos.size > 0 && (
            <button
              onClick={clearFilter}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-xs transition-colors"
              style={{ color: 'var(--text-dim)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
            >
              [x]
            </button>
          )}
        </div>
      </div>

      {/* Task count */}
      {selectedRepos.size > 0 && (
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
        >
          [*] SETTINGS
        </button>
      </div>
    </aside>
  );
}
