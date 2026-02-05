import { useNavigate, useParams } from "@tanstack/react-router";
import { AgentList } from "./agent-list";
import { Button } from "@/components/ui/button";
import * as tauri from "../../tauri/commands";
import { cn } from "@/lib/utils";

// TanStack Query hooks
import { useAgentsQuery } from "@/domains/agents/data/agents-queries";
import { useDeleteAgent } from "@/domains/agents/data/agents-mutations";

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { agentId?: string };
  const selectedAgentId = params.agentId ?? null;

  // Get agents from TanStack Query
  const { data: agents = [] } = useAgentsQuery();
  const deleteAgentMutation = useDeleteAgent();

  // Navigation handlers
  const handleSelectAgent = (agentId: string) => {
    navigate({ to: "/agents/$agentId", params: { agentId } });
  };

  const handleNewAgent = () => {
    navigate({ to: "/" });
  };

  // Archive agents handler
  const handleArchiveAgents = async (agentIds: string[]) => {
    // Close terminals first
    for (const agentId of agentIds) {
      tauri.closeTerminal(agentId).catch(() => { });
    }
    // Delete agents using mutation
    for (const agentId of agentIds) {
      await deleteAgentMutation.mutateAsync(agentId);
    }
    // Navigate away if current agent was archived
    if (selectedAgentId && agentIds.includes(selectedAgentId)) {
      navigate({ to: "/" });
    }
  };

  return (
    <aside
      className={cn(
        "h-full whitespace-nowrap overflow-hidden flex flex-col transition-all duration-200 border-r border-border bg-sidebar",
        collapsed ? "w-0 -translate-x-full" : "w-[280px] translate-x-0"
      )}
    >
      <div className="p-3 space-y-2">
        <Button
          variant="default"
          size="lg"
          onClick={handleNewAgent}
          className="w-full"
          title="Spawn agent"
        >
          Spawn agent
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <h3 className="text-sm font-medium text-muted-foreground px-3 py-2">Agents</h3>
        <AgentList
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={handleSelectAgent}
          onArchiveAgent={async (agentId) => {
            await handleArchiveAgents([agentId]);
          }}
        />
      </div>
    </aside>
  );
}
