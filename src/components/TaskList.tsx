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
  onArchiveTask?: (taskId: string) => void;
  selectMode?: boolean;
  selectedTaskIds?: Set<string>;
  onToggleTaskSelection?: (taskId: string) => void;
}

type StatusCategory = "waiting" | "working" | "idle";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function getStatusCategory(status: TaskStatus, hasPendingPermission: boolean): StatusCategory {
  if (hasPendingPermission || status === "waiting_input") return "waiting";
  if (status === "running" || status === "queued") return "working";
  return "idle";
}

const categoryConfig: Record<StatusCategory, { label: string; color: string }> = {
  waiting: { label: "Waiting for answer", color: "var(--accent-yellow)" },
  working: { label: "Working", color: "var(--accent-green)" },
  idle: { label: "Idle", color: "var(--text-dim)" },
};

function Spinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <span style={{ color: "var(--accent-green)" }}>{SPINNER_FRAMES[frame]}</span>
  );
}

function SlidingText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    if (containerRef.current && textRef.current) {
      setIsOverflowing(textRef.current.scrollWidth > containerRef.current.clientWidth);
    }
  }, [text]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ ...style, overflow: "hidden", position: "relative" }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <span
        ref={textRef}
        style={{
          display: "inline-block",
          whiteSpace: "nowrap",
          transition: isHovering && isOverflowing ? "transform 2s linear" : "none",
          transform: isHovering && isOverflowing
            ? `translateX(-${(textRef.current?.scrollWidth || 0) - (containerRef.current?.clientWidth || 0)}px)`
            : "translateX(0)",
        }}
      >
        {text}
      </span>
    </div>
  );
}

interface TaskGroup {
  category: StatusCategory;
  repos: Map<string, Task[]>;
}

function groupTasksByStatusAndRepo(
  tasks: Task[],
  pendingPermissionTaskIds: Set<string>
): TaskGroup[] {
  const groups: Record<StatusCategory, Map<string, Task[]>> = {
    waiting: new Map(),
    working: new Map(),
    idle: new Map(),
  };

  for (const task of tasks) {
    const hasPendingPermission = pendingPermissionTaskIds.has(task.id);
    const category = getStatusCategory(task.status, hasPendingPermission);
    const repoName = task.repository_path.split("/").pop() || task.repository_path;

    if (!groups[category].has(repoName)) {
      groups[category].set(repoName, []);
    }
    groups[category].get(repoName)!.push(task);
  }

  // Return in order: waiting, working, idle (only non-empty)
  const result: TaskGroup[] = [];
  for (const category of ["waiting", "working", "idle"] as StatusCategory[]) {
    if (groups[category].size > 0) {
      result.push({ category, repos: groups[category] });
    }
  }
  return result;
}

export function TaskList({
  tasks,
  selectedTaskId,
  onSelectTask,
  pendingPermissionTaskIds = new Set(),
  onArchiveTask,
  selectMode = false,
  selectedTaskIds = new Set(),
  onToggleTaskSelection,
}: TaskListProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<StatusCategory>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    taskId: null,
  });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(
    () => groupTasksByStatusAndRepo(tasks, pendingPermissionTaskIds),
    [tasks, pendingPermissionTaskIds]
  );

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

  const toggleCategory = (category: StatusCategory) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  if (tasks.length === 0) {
    return (
      <div className="p-4 text-center" style={{ color: "var(--text-dim)" }}>
        <p>No tasks yet</p>
        <p className="text-xs mt-1">Create a new task to get started</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col">
        {groups.map((group) => {
          const config = categoryConfig[group.category];
          const isCollapsed = collapsedCategories.has(group.category);
          const taskCount = Array.from(group.repos.values()).reduce((sum, t) => sum + t.length, 0);

          return (
            <div key={group.category}>
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(group.category)}
                className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  borderBottom: "1px solid var(--border-default)",
                }}
              >
                <span
                  className="text-xs transition-transform"
                  style={{
                    color: "var(--text-dim)",
                    transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                  }}
                >
                  ▼
                </span>
                <span
                  className="text-xs font-medium flex-1"
                  style={{ color: config.color }}
                >
                  {config.label}
                </span>
                <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                  {taskCount}
                </span>
              </button>

              {/* Tasks grouped by repo */}
              {!isCollapsed && (
                <div>
                  {Array.from(group.repos.entries()).map(([repoName, repoTasks]) => (
                    <div key={repoName}>
                      {/* Repo subheader */}
                      <div
                        className="px-3 py-1.5 text-xs"
                        style={{
                          backgroundColor: "var(--bg-surface)",
                          borderBottom: "1px solid var(--border-default)",
                          color: "var(--text-secondary)",
                        }}
                      >
                        {repoName}
                      </div>

                      {/* Tasks */}
                      {repoTasks.map((task) => {
                        const isSelected = selectedTaskId === task.id;
                        const isChecked = selectedTaskIds.has(task.id);
                        const isRunning = task.status === "running";

                        return (
                          <div
                            key={task.id}
                            className="group px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer"
                            style={{
                              backgroundColor: isSelected
                                ? "var(--bg-elevated)"
                                : isChecked
                                ? "var(--bg-surface)"
                                : "transparent",
                              borderLeft: isSelected
                                ? "2px solid var(--accent-cyan)"
                                : "2px solid transparent",
                              borderBottom: "1px solid var(--border-default)",
                            }}
                            onClick={() =>
                              selectMode
                                ? onToggleTaskSelection?.(task.id)
                                : onSelectTask(task.id)
                            }
                            onContextMenu={(e) => handleContextMenu(e, task.id)}
                            onMouseEnter={(e) => {
                              if (!isSelected && !selectMode) {
                                e.currentTarget.style.backgroundColor = "var(--bg-elevated)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected && !selectMode) {
                                e.currentTarget.style.backgroundColor = isChecked
                                  ? "var(--bg-surface)"
                                  : "transparent";
                              }
                            }}
                          >
                            {selectMode && (
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => onToggleTaskSelection?.(task.id)}
                                className="accent-cyan-400"
                                onClick={(e) => e.stopPropagation()}
                              />
                            )}

                            {isRunning && (
                              <span className="flex-shrink-0">
                                <Spinner />
                              </span>
                            )}

                            <div className="flex-1 min-w-0">
                              <SlidingText
                                text={task.name}
                                className="text-xs font-medium"
                                style={{
                                  color: isSelected
                                    ? "var(--text-primary)"
                                    : "var(--text-secondary)",
                                }}
                              />
                              <SlidingText
                                text={task.branch}
                                className="text-xs mt-0.5"
                                style={{ color: "var(--text-dim)" }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
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
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <button
            onClick={handleArchive}
            className="w-full text-left px-3 py-1.5 text-xs transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-surface)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            Archive
          </button>
        </div>
      )}
    </>
  );
}
