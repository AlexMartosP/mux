import { TerminalView } from "@/components/TerminalView";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface AgentTerminalTabProps {
  agentId: string;
}

export function AgentTerminalTab({ agentId }: AgentTerminalTabProps) {
  return (
    <ErrorBoundary name="Terminal" inline>
      <TerminalView agentId={agentId} />
    </ErrorBoundary>
  );
}
