import { useState, useMemo, useEffect, useRef } from "react";
import type { Task, TaskStatus } from "../types/task";

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  taskId: string | null;
}

interface TaskListProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  pendingPermissionTaskIds?: Set<string>;
  onTogglePin?: (taskId: string, pinned: boolean) => void;
  onArchiveTask?: (taskId: string) => void;
  // Multi-select props
  selectMode?: boolean;
  selectedTaskIds?: Set<string>;
  onToggleTaskSelection?: (taskId: string) => void;
}

const statusConfig: Record<
  TaskStatus,
  { indicator: string; color: string; borderColor: string }
> = {
  idle: { indicator: "I", color: "var(--text-dim)", borderColor: "var(--border-default)" },
  running: { indicator: "R", color: "var(--accent-green)", borderColor: "var(--accent-green)" },
  waiting_input: { indicator: "W", color: "var(--accent-yellow)", borderColor: "var(--accent-yellow)" },
  completed: { indicator: "C", color: "var(--text-secondary)", borderColor: "var(--text-secondary)" },
  error: { indicator: "E", color: "var(--accent-red)", borderColor: "var(--accent-red)" },
  manual_control: { indicator: "M", color: "var(--accent-magenta)", borderColor: "var(--accent-magenta)" },
  interrupted: { indicator: "!", color: "var(--accent-orange, #f97316)", borderColor: "var(--accent-orange, #f97316)" },
  queued: { indicator: "Q", color: "var(--accent-cyan)", borderColor: "var(--accent-cyan)" },
};

interface TaskGroup {
  path: string;
  name: string;
  tasks: Task[];
  runningCount: number;
}

function groupTasksByRepository(tasks: Task[]): TaskGroup[] {
  const groups = new Map<string, Task[]>();

  for (const task of tasks) {
    const path = task.repository_path;
    if (!groups.has(path)) {
      groups.set(path, []);
    }
    groups.get(path)!.push(task);
  }

  return Array.from(groups.entries()).map(([path, tasks]) => ({
    path,
    name: path.split("/").pop() || path,
    tasks,
    runningCount: tasks.filter(t => t.status === "running").length,
  }));
}

function StatusIndicator({ status }: { status: TaskStatus }) {
  const config = statusConfig[status];
  return (
    <span
      className="text-xs font-medium"
      style={{ color: config.color }}
    >
      [{config.indicator}]
    </span>
  );
}

function LoadingIndicator() {
  return (
    <span
      className="text-xs font-medium animate-pulse"
      style={{ color: 'var(--text-dim)' }}
    >
      [...]
    </span>
  );
}

function SkeletonText({ width }: { width: string }) {
  return (
    <span
      className="inline-block animate-pulse rounded"
      style={{
        width,
        height: '12px',
        backgroundColor: 'var(--border-default)',
      }}
    />
  );
}

export function TaskList({
  tasks,
  selectedTaskId,
  onSelectTask,
  pendingPermissionTaskIds,
  onTogglePin,
  onArchiveTask,
  selectMode = false,
  selectedTaskIds = new Set(),
  onToggleTaskSelection,
}: TaskListProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    taskId: null,
  });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu((prev) => ({ ...prev, visible: false }));
      }
    };

    if (contextMenu.visible) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [contextMenu.visible]);

  const handleContextMenu = (e: React.MouseEvent, taskId: string) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      taskId,
    });
  };

  const handleArchive = () => {
    if (contextMenu.taskId && onArchiveTask) {
      onArchiveTask(contextMenu.taskId);
    }
    setContextMenu((prev) => ({ ...prev, visible: false }));
  };

  const groups = useMemo(() => groupTasksByRepository(tasks), [tasks]);

  const toggleGroup = (path: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  if (tasks.length === 0) {
    return (
      <div className="p-4 text-center" style={{ color: 'var(--text-dim)' }}>
        <p>No tasks yet</p>
        <p className="text-xs mt-1">Create a new task to get started</p>
      </div>
    );
  }

  return (
    <>
    <div className="flex flex-col">
      {groups.map((group) => {
        const isCollapsed = collapsedGroups.has(group.path);

        return (
          <div key={group.path}>
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(group.path)}
              className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderBottom: '1px solid var(--border-default)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-elevated)'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
            >
              <span
                className="text-xs transition-transform"
                style={{
                  color: 'var(--text-dim)',
                  transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                }}
              >
                ▼
              </span>
              <span
                className="text-xs font-medium flex-1 truncate"
                style={{ color: 'var(--text-primary)' }}
                title={group.path}
              >
                {group.name}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
                {group.tasks.length}
              </span>
              {group.runningCount > 0 && (
                <span className="text-xs" style={{ color: 'var(--accent-green)' }}>
                  [{group.runningCount}R]
                </span>
              )}
            </button>

            {/* Group Tasks */}
            {!isCollapsed && (
              <ul className="flex flex-col">
                {group.tasks.map((task) => {
                  const config = statusConfig[task.status];
                  const isSelected = selectedTaskId === task.id;
                  const isLoading = task.metadata_loading;
                  const hasPendingPermission = pendingPermissionTaskIds?.has(task.id);
                  const isChecked = selectedTaskIds.has(task.id);

                  return (
                    <li key={task.id}>
                      <div
                        className="group w-full text-left px-3 py-2 pl-6 transition-colors flex items-start gap-2"
                        style={{
                          backgroundColor: isSelected ? 'var(--bg-elevated)' : isChecked ? 'var(--bg-surface)' : 'transparent',
                          borderLeft: `2px solid ${isSelected ? config.borderColor : hasPendingPermission ? 'var(--accent-yellow)' : 'transparent'}`,
                          borderBottom: '1px solid var(--border-default)',
                        }}
                        onContextMenu={(e) => handleContextMenu(e, task.id)}
                      >
                        {selectMode && (
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => onToggleTaskSelection?.(task.id)}
                            className="mt-0.5 accent-cyan-400"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                        <button
                          onClick={() => selectMode ? onToggleTaskSelection?.(task.id) : onSelectTask(task.id)}
                          className="flex-1 text-left"
                          onMouseEnter={(e) => {
                            if (!isSelected && !selectMode) {
                              e.currentTarget.parentElement!.style.backgroundColor = 'var(--bg-elevated)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected && !selectMode) {
                              e.currentTarget.parentElement!.style.backgroundColor = isChecked ? 'var(--bg-surface)' : 'transparent';
                            }
                          }}
                        >
                        <div className="flex items-center gap-2">
                          {isLoading ? <LoadingIndicator /> : <StatusIndicator status={task.status} />}
                          {hasPendingPermission && (
                            <span
                              className="text-xs font-medium"
                              style={{ color: 'var(--accent-yellow)' }}
                              title="Permission required"
                            >
                              [?]
                            </span>
                          )}
                          {task.pinned && (
                            <span
                              className="text-xs cursor-pointer"
                              style={{ color: 'var(--accent-yellow)' }}
                              title="Pinned - click to unpin"
                              onClick={(e) => { e.stopPropagation(); onTogglePin?.(task.id, false); }}
                            >
                              [^]
                            </span>
                          )}
                          {isLoading ? (
                            <SkeletonText width="120px" />
                          ) : (
                            <span
                              className="text-xs font-medium truncate flex-1"
                              style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                            >
                              {task.name}
                            </span>
                          )}
                        </div>
                        {isLoading ? (
                          <p className="mt-1 pl-6">
                            <SkeletonText width="180px" />
                          </p>
                        ) : task.description && (
                          <p
                            className="text-xs truncate mt-1 pl-6"
                            style={{ color: 'var(--text-dim)' }}
                          >
                            {task.description}
                          </p>
                        )}
                        <p
                          className="text-xs truncate mt-0.5 pl-6"
                          style={{ color: 'var(--text-dim)' }}
                        >
                          {task.branch}
                        </p>
                        </button>
                        {!selectMode && !task.pinned && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onTogglePin?.(task.id, true); }}
                            className="opacity-0 group-hover:opacity-100 text-xs px-1 self-start mt-1 transition-opacity"
                            style={{ color: 'var(--text-dim)' }}
                            title="Pin task"
                            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-yellow)'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
                          >
                            [^]
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>

    {/* Context Menu */}
    {contextMenu.visible && (
      <div
        ref={contextMenuRef}
        className="fixed z-50 py-1 min-w-32 shadow-lg"
        style={{
          left: contextMenu.x,
          top: contextMenu.y,
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
        }}
      >
        <button
          onClick={handleArchive}
          className="w-full text-left px-3 py-1.5 text-xs transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-surface)';
            e.currentTarget.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
        >
          Archive
        </button>
      </div>
    )}
    </>
  );
}
