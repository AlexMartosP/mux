import { createFileRoute } from "@tanstack/react-router";
import { AgentSpawn } from "@/domains/agents/ui/agent-spawn";

export const Route = createFileRoute("/_app/agents/")({
  component: AgentsIndex,
});

function AgentsIndex() {




  return (
    <AgentSpawn
    />
  );
}
