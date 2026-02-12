import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import Logo from "@/domains/assets/logo.svg?react";
import { BranchCombobox } from "@/components/BranchCombobox";
import { AgentsRepoSelector } from "./agents-repo-selector";
import { AgentChatInput } from "./agent-chat-input";
import { useSelectedWorkspaceId } from "@/contexts/WorkspaceContext";
import * as tauri from "@/domains/tauri/commands";
import { useSpawnAgent } from "@/domains/agents/data/agents-mutations";
import type { BranchInfo, ImageAttachment } from "@/types/agent";

const LAST_REPO_KEY = "mux-last-selected-repo";

export function AgentSpawn() {
  const workspaceId = useSelectedWorkspaceId();
  const navigate = useNavigate();
  const spawnAgentMutation = useSpawnAgent();

  // State
  const [repositoryPath, setRepositoryPath] = useState(() => {
    return localStorage.getItem(LAST_REPO_KEY) || "";
  });
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>("");
  const [newBranchMode, setNewBranchMode] = useState<"auto" | "custom" | null>("auto");
  const [customBranchName, setCustomBranchName] = useState<string>("");
  const [selectedBaseBranch, setSelectedBaseBranch] = useState<string>("");

  // Load branches when repo path changes
  useEffect(() => {
    if (!repositoryPath) {
      setBranches([]);
      setSelectedBranch("");
      setSelectedBaseBranch("");
      return;
    }
    const loadBranches = async () => {
      try {
        const branchList = await tauri.listBranches(repositoryPath);
        setBranches(branchList);
      } catch {
        setBranches([]);
      }
    };
    loadBranches();
  }, [repositoryPath]);

  // Handle repository selection
  const handleRepoChange = (repo: string) => {
    setRepositoryPath(repo);
    localStorage.setItem(LAST_REPO_KEY, repo);
  };

  // Handle branch selection
  const handleBranchChange = (branch: string) => {
    setSelectedBranch(branch);
  };

  // Handle new branch mode change
  const handleNewBranchModeChange = (mode: "auto" | "custom" | null) => {
    setNewBranchMode(mode);
    if (mode !== "custom") {
      setCustomBranchName("");
    }
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!repositoryPath.trim() || (!prompt.trim() && images.length === 0) || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Only pass baseBranch if we're creating a new branch (not using an existing one)
      const baseBranchToUse = selectedBranch
        ? undefined
        : selectedBaseBranch || undefined;

      // Pass custom branch name if specified
      const branchNameToUse =
        newBranchMode === "custom" && customBranchName.trim()
          ? customBranchName.trim()
          : undefined;

      const newAgent = await spawnAgentMutation.mutateAsync({
        repository_path: repositoryPath.trim(),
        prompt: prompt.trim(),
        existing_branch: selectedBranch || undefined,
        base_branch: baseBranchToUse,
        branch_name: branchNameToUse,
        workspace_id: workspaceId,
        images: images.length > 0 ? images : undefined,
      });

      // Clear form and navigate
      setPrompt("");
      setImages([]);
      setSelectedBaseBranch("");
      setCustomBranchName("");
      setNewBranchMode("auto");

      navigate({ to: "/agents/$agentId", params: { agentId: newAgent.id } });
    } catch (err) {
      console.error("Failed to spawn agent:", err);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-2xl px-8 space-y-6">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Logo className="h-12 w-auto text-foreground" />
        </div>

        {/* Three dropdowns in a row */}
        <div className="grid grid-cols-3 gap-3">
          {/* Repository selector */}
          <AgentsRepoSelector
            selectedRepo={repositoryPath}
            onSelectRepo={handleRepoChange}
          />

          {/* Branch selector */}
          <BranchCombobox
            branches={branches}
            value={selectedBranch}
            onChange={handleBranchChange}
            newBranchMode={newBranchMode}
            onNewBranchModeChange={handleNewBranchModeChange}
            label="[B]"
            placeholder="Select branch"
            disabled={!repositoryPath}
            showNewBranchOptions={true}
            repositoryPath={repositoryPath}
          />

          {/* Base branch selector */}
          <BranchCombobox
            branches={branches}
            value={selectedBaseBranch}
            onChange={setSelectedBaseBranch}
            label="[↑]"
            placeholder="Base branch"
            disabled={!repositoryPath || !!selectedBranch}
            showNewBranchOptions={false}
            repositoryPath={repositoryPath}
          />
        </div>

        {/* Prompt input */}
        <AgentChatInput
          message={prompt}
          onChangeMessage={setPrompt}
          onSend={handleSubmit}
          isSending={isSubmitting}
          disabled={!repositoryPath}
          repositoryPath={repositoryPath || ""}
          placeholder={
            repositoryPath
              ? "Type / for commands..."
              : "Select a repository first..."
          }
          showAcceptEdits={false}
          images={images}
          onImagesChange={setImages}
        />
      </div>
    </div>
  );
}
