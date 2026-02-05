import { AgentChangesCompact } from "./agent-changes-compact";

interface AgentChangesTabProps {
  agentId: string;
}

export function AgentChangesTab({ agentId }: AgentChangesTabProps) {
  return <AgentChangesCompact agentId={agentId} />;
}
