import { useState } from "react";
import type { Agent } from "@/types/agent";
import { useSetAgentAutoAcceptEdits } from "@/domains/agents/data/agents-mutations";
import { StatusBanners } from "@/domains/agents/ui/status-banners";
import { AgentChatInput } from "./agent-chat-input";
import { AgentPermissionRequestPopover } from "@/domains/agents/ui/agent-permission-request-popover";
import { useAgentPermissions } from "@/contexts/PermissionsContext";
import { PermissionRequest } from "@/domains/tauri/commands";


export function FloatingInput({
  agent,
  onSendMessage,
  isSending,
}: {
  agent: Agent;
  onSendMessage: (prompt: string) => void;
  isSending: boolean;
}) {
  const [prompt, setPrompt] = useState("");
  const setAgentAutoAcceptEdits = useSetAgentAutoAcceptEdits();
  const isRunning = agent.status === "running";

  // Use context hook to get permission requests for this agent
  const { requests: permissionRequests, allowRequest, dismissRequest } = useAgentPermissions(agent.id);
  function handleSend() {
    if (!prompt.trim() || isRunning) return;
    onSendMessage(prompt.trim());
    setPrompt("");
  }

  function handleAutoAcceptEditsChange(pressed: boolean) {
    setAgentAutoAcceptEdits.mutate({ id: agent.id, enabled: pressed });
  }

  function handleAllow(request: PermissionRequest) {
    allowRequest(request.request_id);
  }

  function handleDeny(request: PermissionRequest) {
    dismissRequest(request.request_id);
  }

  return (
    <div className="relative">
      {permissionRequests.length > 0 && (
        <AgentPermissionRequestPopover agent={agent} requests={permissionRequests} onAllow={handleAllow} onDeny={handleDeny} />
      )}
      <StatusBanners agent={agent} onRetry={() => onSendMessage("")} />

      <AgentChatInput
        message={prompt}
        onChangeMessage={setPrompt}
        onSend={handleSend}
        isSending={isSending}
        repositoryPath={agent.repository_path}
        showAcceptEdits={true}
        acceptEdits={agent.auto_accept_edits ?? false}
        onAcceptEditsChange={handleAutoAcceptEditsChange}
      />
    </div>
  );
}
