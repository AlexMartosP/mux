import { useState, useMemo } from "react";
import type { Task, TaskStatus } from "../types/task";

interface TaskListProps {
  tasks: Task[];
  selectedTaskId: string | null;
  onSelectTask: (taskId: string) => void;
  pendingPermissionTaskIds?: Set<string>;
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
  selectMode = false,
  selectedTaskIds = new Set(),
  onToggleTaskSelection,
}: TaskListProps) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

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
                        className="w-full text-left px-3 py-2 pl-6 transition-colors flex items-start gap-2"
                        style={{
                          backgroundColor: isSelected ? 'var(--bg-elevated)' : isChecked ? 'var(--bg-surface)' : 'transparent',
                          borderLeft: `2px solid ${isSelected ? config.borderColor : hasPendingPermission ? 'var(--accent-yellow)' : 'transparent'}`,
                          borderBottom: '1px solid var(--border-default)',
                        }}
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
  );
}
