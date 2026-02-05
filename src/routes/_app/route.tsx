import { createFileRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "sonner";
import logger from "@/domains/logger/logger";
import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLocation } from "@tanstack/react-router";
import { useParams } from "@tanstack/react-router";
import { useUpdateNotifications } from "@/hooks/useUpdateNotifications";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Sidebar } from "@/domains/app/ui/sidebar";
import { TopNavBar } from "@/domains/app/ui/top-bar";
import { WorkspaceProvider, useWorkspace } from "@/contexts/WorkspaceContext";

// TanStack Query hooks
import { useAgentsQuery, useAgentQuery } from "@/domains/agents/data/agents-queries";
import { useAgentEvents } from "@/domains/agents/data/agents-events";
import { useStopAgent, useRestartAgent } from "@/domains/agents/data/agents-mutations";

export const Route = createFileRoute("/_app")({
  component: AppLayoutWrapper,
});

const SIDEBAR_COLLAPSED_KEY = "mux-sidebar-collapsed";

// Wrapper to provide WorkspaceContext
function AppLayoutWrapper() {
  return (
    <WorkspaceProvider>
      <AppLayout />
    </WorkspaceProvider>
  );
}

function AppLayout() {
  logger.info("Initializing RootLayout");
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams({ strict: false }) as { agentId?: string };
  const selectedAgentId = params.agentId ?? null;

  // Onboarding renders without the app shell
  const isOnboarding = location.pathname.startsWith("/onboarding");

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  });

  // Workspace context
  const { workspaces, selectedWorkspaceId, setSelectedWorkspaceId } = useWorkspace();

  // TanStack Query hooks
  const { data: agents = [], isLoading, error } = useAgentsQuery();

  // Mutations for keyboard shortcuts
  const stopAgentMutation = useStopAgent();
  const restartAgentMutation = useRestartAgent();

  // Set up event listeners for real-time updates
  useAgentEvents();

  const selectedAgent = useAgentQuery(selectedAgentId);

  // Navigation handlers
  const handleSelectAgent = useCallback(
    (id: string) => {
      navigate({ to: "/agents/$agentId", params: { agentId: id } });
    },
    [navigate]
  );

  const handlePreviousAgent = useCallback(() => {
    if (agents.length === 0) return;
    const currentIndex = agents.findIndex((a) => a.id === selectedAgentId);
    if (currentIndex > 0) {
      handleSelectAgent(agents[currentIndex - 1].id);
    } else if (currentIndex === -1 && agents.length > 0) {
      handleSelectAgent(agents[0].id);
    }
  }, [agents, selectedAgentId, handleSelectAgent]);

  const handleNextAgent = useCallback(() => {
    if (agents.length === 0) return;
    const currentIndex = agents.findIndex((a) => a.id === selectedAgentId);
    if (currentIndex < agents.length - 1) {
      handleSelectAgent(agents[currentIndex + 1].id);
    } else if (currentIndex === -1 && agents.length > 0) {
      handleSelectAgent(agents[0].id);
    }
  }, [agents, selectedAgentId, handleSelectAgent]);

  const handleSelectAgentByIndex = useCallback(
    (index: number) => {
      if (index < agents.length) {
        handleSelectAgent(agents[index].id);
      }
    },
    [agents, handleSelectAgent]
  );

  const handleCopyBranch = useCallback(async () => {
    if (selectedAgent) {
      await writeText(selectedAgent.branch);
    }
  }, [selectedAgent]);

  const handleCreatePR = useCallback(() => {
    console.log("Create PR shortcut triggered");
  }, []);

  const handleNewChat = useCallback(() => {
    navigate({ to: "/" });
  }, [navigate]);

  const handleOpenSettings = useCallback(() => {
    navigate({ to: "/settings" });
  }, [navigate]);


  const handleToggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const newValue = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(newValue));
      return newValue;
    });
  }, []);

  // Determine if settings view is open based on current route
  const isSettingsOpen =
    location.pathname === "/settings" ||
    location.pathname === "/workspace-settings";

  useUpdateNotifications();

  useKeyboardShortcuts({
    onNewTask: handleNewChat,
    onOpenSettings: handleOpenSettings,
    onCloseModal: () => {
      if (isSettingsOpen) {
        navigate({ to: "/" });
      }
    },
    onPreviousTask: handlePreviousAgent,
    onNextTask: handleNextAgent,
    onSelectTaskByIndex: handleSelectAgentByIndex,
    selectedTaskId: selectedAgentId,
    onStopTask: selectedAgentId
      ? () => stopAgentMutation.mutate(selectedAgentId)
      : undefined,
    onRestartTask: selectedAgentId
      ? () => restartAgentMutation.mutate({ id: selectedAgentId })
      : undefined,
    onCopyBranch: handleCopyBranch,
    onCreatePR: handleCreatePR,
    isSettingsOpen,
    onToggleSidebar: handleToggleSidebar,
  });

  if (isLoading && !isOnboarding) {
    return (
      <div
        className="h-screen flex items-center justify-center text-xs"
        style={{
          backgroundColor: "var(--bg-primary)",
          color: "var(--text-dim)",
        }}
      >
        Loading...
      </div>
    );
  }

  if (error && !isOnboarding) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <div className="text-center">
          <p className="text-xs mb-4" style={{ color: "var(--accent-red)" }}>
            {error instanceof Error ? error.message : "Failed to load agents"}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-xs transition-colors"
            style={{
              backgroundColor: "transparent",
              border: "1px solid var(--border-active)",
              color: "var(--text-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent-cyan)";
              e.currentTarget.style.color = "var(--accent-cyan)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border-active)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            RETRY
          </button>
        </div>
      </div>
    );
  }

  // Onboarding renders without the app shell
  if (isOnboarding) {
    return (
      <>
        <Outlet />
        <Toaster position="bottom-right" />
      </>
    );
  }

  return (
    <div
      className="h-screen flex flex-col bg-background "
    >
      <TopNavBar
        workspaces={workspaces}
        selectedWorkspaceId={selectedWorkspaceId}
        onSelectWorkspace={setSelectedWorkspaceId}
        onOpenSettings={handleOpenSettings}
        onToggleSidebar={handleToggleSidebar}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar collapsed={sidebarCollapsed} />
        <div className="flex-1 overflow-y-auto h-full">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
