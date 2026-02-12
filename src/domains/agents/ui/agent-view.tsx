import { useState, useEffect } from "react";
import { HandbackModal } from "@/components/HandbackModal";
import type { Agent } from "@/types/agent";
import * as tauri from "@/domains/tauri/commands";
import { AgentSetup } from "./agent-setup";
import { AgentViewHeader, type ViewTab } from "./agent-view-header";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { AgentChatV2 } from "./agent-chat-v2";
import { useDeleteAgent, useStopAgent } from "@/domains/agents/data/agents-mutations";
import { useNavigate } from "@tanstack/react-router";
import { AgentTerminalTab } from "@/domains/agents/ui/agent-terminal-tab";
import { AgentChangesCompact } from "@/domains/agents/ui/agent-changes-compact";

const TAB_STORAGE_PREFIX = "mux-agent-view-tab-";



export function AgentView({
  agent,
  onUpdateAgent,
}: {
  agent: Agent;
  onUpdateAgent?: (agent: Agent) => void;
}) {

  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<ViewTab>("changes");
  const [isHandbackModalOpen, setIsHandbackModalOpen] = useState(false);

  const deleteAgentMutation = useDeleteAgent();
  const stopAgentMutation = useStopAgent();

  useEffect(() => {
    if (agent?.id) {
      const savedTab = localStorage.getItem(`${TAB_STORAGE_PREFIX}${agent.id}`);
      if (savedTab === "changes" || savedTab === "terminal" || savedTab === "null") {
        setActiveTab(savedTab === "null" ? null : savedTab as ViewTab);
      } else {
        setActiveTab("changes");
      }
    }
  }, [agent?.id]);

  function handleTabChange(tab: ViewTab) {
    setActiveTab(tab);
    if (agent?.id) {
      localStorage.setItem(`${TAB_STORAGE_PREFIX}${agent.id}`, tab === null ? "null" : tab);
    }
  };

  async function handleStopAgent(id: string) {
    await stopAgentMutation.mutateAsync(id);
  };

  async function handleDeleteAgent(id: string) {
    await deleteAgentMutation.mutateAsync(id);
    navigate({ to: "/" });
  };


  if (agent.status === "setting_up") {
    return (
      <div className="flex-1 flex flex-col">
        <AgentSetup
          agentName={agent.name}
          currentStage="initializing"
          repositoryPath={agent.repository_path}
          branch={agent.branch}
          onCancel={() => {
            handleStopAgent(agent.id);
            handleDeleteAgent(agent.id);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background h-full">
      <AgentViewHeader
        agent={agent}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onUpdateAgent={onUpdateAgent}
        onDelete={handleDeleteAgent}
        onOpenHandbackModal={() => setIsHandbackModalOpen(true)}
      />

      <ResizablePanelGroup orientation="horizontal" className="flex-1 h-full">
        <ResizablePanel defaultSize="50%" className="h-full">
          <AgentChatV2
            agent={agent}
            onStop={handleStopAgent}
            onUpdateAgent={onUpdateAgent}
          />
        </ResizablePanel>
        {activeTab !== null && (
          <>
            <ResizableHandle withHandle />
            <ResizablePanel
              maxSize="70%"
              minSize="40%"
            >
              {activeTab === "changes" ? (
                <AgentChangesCompact
                  agentId={agent.id} />
              ) : (
                <AgentTerminalTab agentId={agent.id} />
              )}
            </ResizablePanel></>
        )}

      </ResizablePanelGroup>

      <HandbackModal
        agent={agent}
        isOpen={isHandbackModalOpen}
        onClose={() => setIsHandbackModalOpen(false)}
        onHandback={async (commitMessage, promptForClaude) => {
          await tauri.handbackAgent(agent.id, commitMessage, promptForClaude);
        }}
      />
    </div>
  );
}
