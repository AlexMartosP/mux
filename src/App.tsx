import { useState, useEffect, useRef, useCallback } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { listen } from "@tauri-apps/api/event";
import { Sidebar } from "./components/Sidebar";
import { TopNavBar } from "./components/TopNavBar";
import { ChatView } from "./components/ChatView";
import { SetupScreen } from "./components/SetupScreen";
import { Settings } from "./components/Settings";
import { WorkspaceSettings } from "./components/WorkspaceSettings";
import { Onboarding } from "./components/Onboarding";
import { ToastContainer } from "./components/Toast";
import { useAgents } from "./hooks/useAgents";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useUpdateNotifications } from "./hooks/useUpdateNotifications";
import { useCIStatus } from "./hooks/useCIStatus";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./contexts/ToastContext";
import * as tauri from "./lib/tauri";
import type { SetupStage, SetupProgressEvent, Workspace } from "./types/agent";

const SIDEBAR_COLLAPSED_KEY = "mux-sidebar-collapsed";

type View = "chat" | "settings" | "workspace-settings";

function AppContent() {
  const [currentView, setCurrentView] = useState<View>("chat");
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  });
  // Track setup progress for each agent
  const [setupProgress, setSetupProgress] = useState<Record<string, SetupStage>>({});
  // Workspaces
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const {
    agents,
    selectedAgent,
    selectedAgentId,
    isLoading,
    error,
    setSelectedAgentId,
    spawnAgent,
    deleteAgent,
    stopAgent,
    restartAgent,
    updateAgent,
    refresh: refreshAgents,
  } = useAgents();

  // CI status for agents with PRs
  const { ciStatuses } = useCIStatus(agents);

  // Ref for focusing search input in sidebar
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts handlers
  const handlePreviousAgent = useCallback(() => {
    if (agents.length === 0) return;
    const currentIndex = agents.findIndex((a) => a.id === selectedAgentId);
    if (currentIndex > 0) {
      setSelectedAgentId(agents[currentIndex - 1].id);
    } else if (currentIndex === -1) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId, setSelectedAgentId]);

  const handleNextAgent = useCallback(() => {
    if (agents.length === 0) return;
    const currentIndex = agents.findIndex((a) => a.id === selectedAgentId);
    if (currentIndex < agents.length - 1) {
      setSelectedAgentId(agents[currentIndex + 1].id);
    } else if (currentIndex === -1) {
      setSelectedAgentId(agents[0].id);
    }
  }, [agents, selectedAgentId, setSelectedAgentId]);

  const handleSelectAgentByIndex = useCallback(
    (index: number) => {
      if (index < agents.length) {
        setSelectedAgentId(agents[index].id);
        setCurrentView("chat");
      }
    },
    [agents, setSelectedAgentId]
  );

  const handleCopyBranch = useCallback(async () => {
    if (selectedAgent) {
      await writeText(selectedAgent.branch);
    }
  }, [selectedAgent]);

  const handleCreatePR = useCallback(() => {
    // This will be handled by the ChatView component
    // For now, we could open a modal or trigger the PR flow
    console.log("Create PR shortcut triggered");
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  const handleNewChat = useCallback(() => {
    setSelectedAgentId(null);
    setCurrentView("chat");
  }, [setSelectedAgentId]);

  const handleOpenSettings = useCallback(() => {
    setCurrentView("settings");
  }, []);

  const handleCloseSettings = useCallback(() => {
    setCurrentView("chat");
  }, []);

  const handleOpenWorkspaceSettings = useCallback(() => {
    setCurrentView("workspace-settings");
  }, []);

  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const newValue = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newValue));
      return newValue;
    });
  }, []);

  // Use update notifications hook
  useUpdateNotifications();

  // Set up keyboard shortcuts
  useKeyboardShortcuts({
    onNewTask: handleNewChat,
    onOpenSettings: handleOpenSettings,
    onCloseModal: () => {
      if (currentView === "settings" || currentView === "workspace-settings") {
        setCurrentView("chat");
      }
    },
    onFocusSearch: () => {
      searchInputRef.current?.focus();
    },
    onPreviousTask: handlePreviousAgent,
    onNextTask: handleNextAgent,
    onSelectTaskByIndex: handleSelectAgentByIndex,
    selectedTaskId: selectedAgentId,
    onStopTask: selectedAgentId ? () => stopAgent(selectedAgentId) : undefined,
    onRestartTask: selectedAgentId ? () => restartAgent(selectedAgentId) : undefined,
    onCopyBranch: handleCopyBranch,
    onCreatePR: handleCreatePR,
    isSettingsOpen: currentView === "settings" || currentView === "workspace-settings",
    onToggleSidebar: handleToggleSidebar,
  });

  // Check if onboarding has been completed
  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const completed = await tauri.isOnboardingCompleted();
        setShowOnboarding(!completed);
      } catch (err) {
        console.error("Failed to check onboarding status:", err);
        setShowOnboarding(false); // Default to not showing on error
      }
    };
    checkOnboarding();
  }, []);

  // Load workspaces
  const loadWorkspaces = useCallback(async () => {
    try {
      const ws = await tauri.getWorkspaces();
      setWorkspaces(ws);
      // Set default workspace if not already selected
      if (!selectedWorkspaceId && ws.length > 0) {
        const defaultWs = ws.find((w) => w.is_default);
        if (defaultWs) {
          setSelectedWorkspaceId(defaultWs.id);
        }
      }
    } catch (err) {
      console.error("Failed to load workspaces:", err);
    }
  }, [selectedWorkspaceId]);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  // Listen for agent setup progress events
  useEffect(() => {
    const unlisten = listen<SetupProgressEvent>("agent-setup-progress", (event) => {
      const { agent_id, stage } = event.payload;
      setSetupProgress((prev) => ({
        ...prev,
        [agent_id]: stage,
      }));
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleSpawnAgent = async (repositoryPath: string, prompt: string, existingBranch?: string, baseBranch?: string, branchName?: string) => {
    await spawnAgent({ repository_path: repositoryPath, prompt, existing_branch: existingBranch, base_branch: baseBranch, branch_name: branchName });
  };

  // Show loading while checking onboarding status
  if (showOnboarding === null || isLoading) {
    return (
      <div
        className="h-screen flex items-center justify-center text-xs"
        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-dim)' }}
      >
        Loading...
      </div>
    );
  }

  // Show onboarding if not completed
  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (error) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div className="text-center">
          <p className="text-xs mb-4" style={{ color: 'var(--accent-red)' }}>{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-xs transition-colors"
            style={{
              backgroundColor: 'transparent',
              border: '1px solid var(--border-active)',
              color: 'var(--text-secondary)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent-cyan)';
              e.currentTarget.style.color = 'var(--accent-cyan)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-active)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="h-screen flex flex-col"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      {/* Top Navigation Bar */}
      <TopNavBar
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onSelectWorkspace={setSelectedWorkspaceId}
        onOpenSettings={handleOpenSettings}
        onOpenWorkspaceSettings={handleOpenWorkspaceSettings}
      />

      {/* Main content area with sidebar */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={(id) => {
            setSelectedAgentId(id);
            setCurrentView("chat");
          }}
          onNewAgent={handleNewChat}
          onOpenSettings={handleOpenSettings}
          onArchiveAgents={async (agentIds) => {
            // Close terminal sessions for archived agents
            for (const agentId of agentIds) {
              tauri.closeTerminal(agentId).catch(() => {}); // Ignore errors
            }
            await tauri.deleteAgents(agentIds);
            // If the currently selected agent was archived, clear selection
            if (selectedAgentId && agentIds.includes(selectedAgentId)) {
              setSelectedAgentId(null);
            }
            // Refresh agent list
            await refreshAgents();
          }}
          searchInputRef={searchInputRef}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
          ciStatuses={ciStatuses}
        />

        {currentView === "settings" ? (
          <Settings
            onClose={handleCloseSettings}
            onRestartOnboarding={() => setShowOnboarding(true)}
            onWorkspacesChange={loadWorkspaces}
          />
        ) : currentView === "workspace-settings" ? (
          <div
            className="flex-1 flex flex-col overflow-hidden"
            style={{ backgroundColor: "var(--bg-primary)" }}
          >
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderBottom: "1px solid var(--border-default)" }}
            >
              <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Workspace Settings
              </h2>
              <button
                onClick={handleCloseSettings}
                className="text-xs px-2 py-1 transition-colors"
                style={{
                  backgroundColor: "transparent",
                  border: "1px solid var(--border-default)",
                  color: "var(--text-secondary)",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-active)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = "var(--border-default)";
                }}
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <WorkspaceSettings onWorkspacesChange={loadWorkspaces} />
            </div>
          </div>
        ) : selectedAgent?.status === "setting_up" ? (
          <div className="flex-1 flex flex-col">
            <SetupScreen
              agentName={selectedAgent.name}
              currentStage={setupProgress[selectedAgent.id] || "initializing"}
              repositoryPath={selectedAgent.repository_path}
              branch={selectedAgent.branch}
              onCancel={() => {
                // Stop the agent and delete it
                stopAgent(selectedAgent.id);
                deleteAgent(selectedAgent.id);
                setSelectedAgentId(null);
              }}
            />
          </div>
        ) : (
          <ChatView
            agent={selectedAgent}
            onSpawnAgent={handleSpawnAgent}
            onStop={stopAgent}
            onRestart={restartAgent}
            onDelete={deleteAgent}
            onUpdateAgent={updateAgent}
          />
        )}
      </div>
      <ToastContainer />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
