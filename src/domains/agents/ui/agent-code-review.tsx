import { ChangesPanel } from "@/components/ChangesPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface AgentCodeReviewProps {
  agentId: string;
  onSendReview: (reviewPrompt: string) => void;
}

export function AgentCodeReview({ agentId, onSendReview }: AgentCodeReviewProps) {
  return (
    <ErrorBoundary name="Code Review" inline>
      <ChangesPanel agentId={agentId} onSendReview={onSendReview} />
    </ErrorBoundary>
  );
}
