import { useState, useMemo } from "react";
import type { Agent, AgentStatus, CIStatus } from "../../../types/agent";
import { AgentListItem } from "./agent-list-item";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface AgentListProps {
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  pendingPermissionAgentIds?: Set<string>;
  onArchiveAgent?: (agentId: string) => void;
  selectMode?: boolean;
  selectedAgentIds?: Set<string>;
  onToggleAgentSelection?: (agentId: string) => void;
  ciStatuses?: Map<string, CIStatus>;
}

type StatusCategory = "waiting" | "working" | "in_review" | "idle";


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
  idle: { label: "Idle", color: "text-muted-foreground" },
};


interface AgentGroup {
  category: StatusCategory;
  repos: Map<string, Agent[]>;
}

function groupAgentsByStatusAndRepo(
  agents: Agent[],
): AgentGroup[] {
  const groups: Record<StatusCategory, Map<string, Agent[]>> = {
    waiting: new Map(),
    working: new Map(),
    in_review: new Map(),
    idle: new Map(),
  };

  for (const agent of agents) {
    const hasPendingPermission = agent.status === "waiting_input";
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
  onArchiveAgent,
}: AgentListProps) {
  const [collapsedCategories, setCollapsedCategories] = useState<Set<StatusCategory>>(new Set());

  const groups = useMemo(
    () => groupAgentsByStatusAndRepo(agents),
    [agents]
  );

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
    <div className="flex flex-col">
      {groups.map((group) => {
        const config = categoryConfig[group.category];
        const isCollapsed = collapsedCategories.has(group.category);
        const agentCount = Array.from(group.repos.values()).reduce((sum, a) => sum + a.length, 0);

        return (
          <div key={group.category}>
            <button
              onClick={() => toggleCategory(group.category)}
              className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors"
            >
              <span
                className={cn("flex-1 text-sm", config.color)}
              >
                {config.label}
              </span>
              <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                {agentCount}
              </span>
              <ChevronDown size={14} strokeWidth={1.5} className={cn("transition-transform", isCollapsed ? "rotate-90" : "rotate-0")} />
            </button>

            {/* Agents grouped by repo */}
            {!isCollapsed && (
              <div>
                {Array.from(group.repos.entries()).map(([repoName, repoAgents]) => (
                  <div key={repoName}>
                    {/* Repo subheader */}
                    <div
                      className="px-3 py-1.5 text-sm font-semibold text-muted-foreground"
                    >
                      {repoName}
                    </div>

                    {/* Agents */}
                    {repoAgents.map((agent) => (
                      <AgentListItem
                        key={agent.id}
                        agent={agent}
                        isSelected={selectedAgentId === agent.id}
                        onSelect={onSelectAgent}
                        onArchive={() => onArchiveAgent?.(agent.id)}
                      />

                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
