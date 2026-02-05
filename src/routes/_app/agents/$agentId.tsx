import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AgentView } from "@/domains/agents/ui/agent-view";
import { useAgentsQuery } from "@/domains/agents/data/agents-queries";

export const Route = createFileRoute("/_app/agents/$agentId")({
  component: AgentDetail,
});

function AgentDetail() {
  const { agentId } = Route.useParams();
  const navigate = useNavigate();

  const { data: agents = [] } = useAgentsQuery();

  const agent = agents.find((a) => a.id === agentId) ?? null;


  // Agent not found - show not found UI
  if (!agent) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <div className="text-center">
          <p className="text-xs mb-4" style={{ color: "var(--text-dim)" }}>
            Agent not found
          </p>
          <button
            onClick={() => navigate({ to: "/" })}
            className="px-4 py-2 text-xs transition-colors"
            style={{
              backgroundColor: "transparent",
              border: "1px solid var(--border-default)",
              color: "var(--text-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-cyan)";
              e.currentTarget.style.color = "var(--accent-cyan)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-default)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            Back to agents
          </button>
        </div>
      </div>
    );
  }

  return (
    <AgentView
      key={agent.id}
      agent={agent}

    />
  );
}
