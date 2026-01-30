import { useState, useMemo, useEffect, useRef } from "react";
import { GitPullRequest } from "lucide-react";
import type { Agent, AgentStatus } from "../types/agent";
import * as tauri from "../lib/tauri";

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  agentId: string | null;
}

interface AgentListProps {
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  pendingPermissionAgentIds?: Set<string>;
  onArchiveAgent?: (agentId: string) => void;
  selectMode?: boolean;
  selectedAgentIds?: Set<string>;
  onToggleAgentSelection?: (agentId: string) => void;
}

type StatusCategory = "waiting" | "working" | "in_review" | "idle";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function getStatusCategory(status: AgentStatus, hasPendingPermission: boolean): StatusCategory {
  if (hasPendingPermission || status === "waiting_input") return "waiting";
  if (status === "running" || status === "queued" || status === "setting_up") return "working";
  if (status === "in_review") return "in_review";
  return "idle";
}

const categoryConfig: Record<StatusCategory, { label: string; color: string }> = {
  waiting: { label: "Waiting for answer", color: "var(--accent-yellow)" },
  working: { label: "Working", color: "var(--accent-green)" },
  in_review: { label: "In Review", color: "var(--accent-purple)" },
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

interface AgentGroup {
  category: StatusCategory;
  repos: Map<string, Agent[]>;
}

function groupAgentsByStatusAndRepo(
  agents: Agent[],
  pendingPermissionAgentIds: Set<string>
): AgentGroup[] {
  const groups: Record<StatusCategory, Map<string, Agent[]>> = {
    waiting: new Map(),
    working: new Map(),
    in_review: new Map(),
    idle: new Map(),
  };

  for (const agent of agents) {
    const hasPendingPermission = pendingPermissionAgentIds.has(agent.id);
    const category = getStatusCategory(agent.status, hasPendingPermission);
    const repoName = agent.repository_path.split("/").pop() || agent.repository_path;

    if (!groups[category].has(repoName)) {
      groups[category].set(repoName, []);
    }
    groups[category].get(repoName)!.push(agent);
  }

  // Return in order: waiting, working, in_review, idle (only non-empty)
  const result: AgentGroup[] = [];
  for (const category of ["waiting", "working", "in_review", "idle"] as StatusCategory[]) {
    if (groups[category].size > 0) {
      result.push({ category, repos: groups[category] });
    }
  }
  return result;
}

export function AgentList({
  agents,
  selectedAgentId,
  onSelectAgent,
  pendingPermissionAgentIds = new Set(),
  onArchiveAgent,
  selectMode = false,
  selectedAgentIds = new Set(),
  onToggleAgentSelection,
}: AgentListProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<StatusCategory>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    agentId: null,
  });
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(
    () => groupAgentsByStatusAndRepo(agents, pendingPermissionAgentIds),
    [agents, pendingPermissionAgentIds]
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

  const handleContextMenu = (e: React.MouseEvent, agentId: string) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      agentId,
    });
  };

  const handleArchive = () => {
    if (contextMenu.agentId && onArchiveAgent) {
      onArchiveAgent(contextMenu.agentId);
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

  if (agents.length === 0) {
    return (
      <div className="p-4 text-center" style={{ color: "var(--text-dim)" }}>
        <p>No agents yet</p>
        <p className="text-xs mt-1">Spawn a new agent to get started</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col">
        {groups.map((group) => {
          const config = categoryConfig[group.category];
          const isCollapsed = collapsedCategories.has(group.category);
          const agentCount = Array.from(group.repos.values()).reduce((sum, a) => sum + a.length, 0);

          return (
            <div key={group.category}>
              {/* Category Header */}
              <button
                onClick={() => toggleCategory(group.category)}
                className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
                style={{
                  backgroundColor: "var(--bg-surface)",
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
                  {agentCount}
                </span>
              </button>

              {/* Agents grouped by repo */}
              {!isCollapsed && (
                <div>
                  {Array.from(group.repos.entries()).map(([repoName, repoAgents]) => (
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

                      {/* Agents */}
                      {repoAgents.map((agent) => {
                        const isSelected = selectedAgentId === agent.id;
                        const isChecked = selectedAgentIds.has(agent.id);
                        const isRunning = agent.status === "running";

                        return (
                          <div
                            key={agent.id}
                            className="group px-3 py-2 flex items-center gap-2 transition-colors cursor-pointer"
                            style={{
                              backgroundColor: isSelected
                                ? "var(--bg-accent-subtle)"
                                : isChecked
                                ? "var(--bg-surface)"
                                : "transparent",
                              borderBottom: "1px solid var(--border-default)",
                            }}
                            onClick={() =>
                              selectMode
                                ? onToggleAgentSelection?.(agent.id)
                                : onSelectAgent(agent.id)
                            }
                            onContextMenu={(e) => handleContextMenu(e, agent.id)}
                            onMouseEnter={(e) => {
                              if (!isSelected && !selectMode) {
                                e.currentTarget.style.backgroundColor = "var(--bg-hover)";
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
                                onChange={() => onToggleAgentSelection?.(agent.id)}
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
                                text={agent.name}
                                className="text-xs font-medium"
                                style={{
                                  color: isSelected
                                    ? "var(--text-primary)"
                                    : "var(--text-secondary)",
                                }}
                              />
                              <div className="flex items-center gap-2 mt-0.5">
                                <SlidingText
                                  text={agent.branch}
                                  className="text-xs"
                                  style={{ color: "var(--text-dim)" }}
                                />
                                {/* Git stats */}
                                {(agent.total_additions || agent.total_deletions) ? (
                                  <span className="text-xs flex-shrink-0">
                                    <span style={{ color: "var(--accent-green)" }}>
                                      +{agent.total_additions || 0}
                                    </span>
                                    <span style={{ color: "var(--text-dim)" }}> </span>
                                    <span style={{ color: "var(--accent-red)" }}>
                                      -{agent.total_deletions || 0}
                                    </span>
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            {/* PR icon */}
                            {agent.pr_url && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  tauri.openPRInBrowser(agent.pr_url!);
                                }}
                                className="flex-shrink-0 p-1 rounded transition-colors"
                                style={{ color: "var(--accent-cyan)" }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.backgroundColor = "var(--bg-surface)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.backgroundColor = "transparent";
                                }}
                                title="Open PR in browser"
                              >
                                <GitPullRequest size={14} />
                              </button>
                            )}
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
