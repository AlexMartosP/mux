import { TerminalView } from "@/components/TerminalView";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface AgentTerminalProps {
  agentId: string;
}

export function AgentTerminal({ agentId }: AgentTerminalProps) {
  return (
    <ErrorBoundary name="Terminal" inline>
      <TerminalView agentId={agentId} />
    </ErrorBoundary>
  );
}
