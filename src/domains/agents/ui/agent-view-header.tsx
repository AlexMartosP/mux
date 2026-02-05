import { useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  MoreVertical,
  FileCode,
  Terminal,
  Dot,
  ArrowUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/agent";
import * as tauri from "@/domains/tauri/commands";
import { EditText } from "@/components/edit-text";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AgentCheckoutLocalButton } from "@/domains/agents/ui/agent-checkout-local-button";
import { AgentsOpenInDropdown } from "@/domains/agents/ui/agents-open-in-dropdown";

export type ViewTab = "changes" | "terminal" | null;


export function AgentViewHeader({
  agent,
  activeTab,
  onTabChange,
  onUpdateAgent,
  onDelete,
  onOpenHandbackModal,
}: {
  agent: Agent;
  activeTab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  onUpdateAgent?: (agent: Agent) => void;
  onDelete: (id: string) => void;
  onOpenHandbackModal: () => void;
}) {
  const [copiedBranch, setCopiedBranch] = useState(false);
  const [isTakingOver, setIsTakingOver] = useState(false);

  const handleCopyBranch = async () => {
    await writeText(agent.branch);
    setCopiedBranch(true);
    setTimeout(() => setCopiedBranch(false), 2000);
  };

  const saveTitle = async (value: string) => {
    if (value.trim() && onUpdateAgent) {
      await tauri.updateAgentName(agent.id, value.trim());
      onUpdateAgent({ ...agent, name: value.trim() });
    }
  };

  const handleTakeover = async () => {
    if (isTakingOver) return;

    setIsTakingOver(true);
    try {
      const result = await tauri.takeoverAgent(agent.id);
      console.log("Takeover successful:", result);
    } catch (err) {
      console.error("Takeover failed:", err);
    } finally {
      setIsTakingOver(false);
    }
  };

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-border">
      <div className="flex items-center gap-1 flex-1">
        <EditText value={agent.name} onBlur={saveTitle} />

        <Dot size={14} />

        {/* Repo */}
        <span className="text-muted-foreground">
          {agent.repository_path.split("/").pop()}
        </span>

        <Dot size={14} />


        {/* Branch */}
        <button
          onClick={handleCopyBranch}
          className={cn(
            "hover:underline cursor-pointer transition-colors truncate max-w-[200px]",
            copiedBranch ? "text-success" : "text-muted-foreground"
          )}
          title="Click to copy branch name"
        >
          {copiedBranch ? "Copied!" : agent.branch}
        </button>

        {/* Base branch */}
        {agent.base_branch && (
          <>
            <ArrowUp width={12} className="text-warning" />
            <span
              className="text-muted-foreground truncate max-w-[120px]"
              title={`Based on ${agent.base_branch}`}
            >
              {agent.base_branch}
            </span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1 border-r border-border pr-1 mr-4">
        <AgentCheckoutLocalButton
          hasCheckedOut={agent.status === "manual_control"}
          onCheckout={handleTakeover}
          onHandback={onOpenHandbackModal}
          disabled={isTakingOver}
        />

        <AgentsOpenInDropdown path={agent.worktree_path} />



        {/* More menu */}
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button variant="ghost" title="More options">
              <MoreVertical size={16} strokeWidth={1.5} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => onDelete(agent.id)}>
              Archive
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1">
          <Toggle
            pressed={activeTab === "changes"}
            onPressedChange={(pressed) => onTabChange(pressed ? "changes" : null)}
          >
            <FileCode size={14} strokeWidth={1.5} />
            <span>Changes</span>
          </Toggle>
          <Toggle
            pressed={activeTab === "terminal"}
            onPressedChange={(pressed) => onTabChange(pressed ? "terminal" : null)}
          >
            <Terminal size={14} strokeWidth={1.5} />
            <span>Terminal</span>
          </Toggle>
        </div>
      </div>


    </header >
  );
}
