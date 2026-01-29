import { useState, useEffect, useRef, useCallback } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { Settings } from "./components/Settings";
import { Onboarding } from "./components/Onboarding";
import { ToastContainer } from "./components/Toast";
import { useTasks } from "./hooks/useTasks";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useUpdateNotifications } from "./hooks/useUpdateNotifications";
import { ReviewProvider } from "./contexts/ReviewContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ToastProvider } from "./contexts/ToastContext";
import * as tauri from "./lib/tauri";

const SIDEBAR_COLLAPSED_KEY = "mux-sidebar-collapsed";

type View = "chat" | "settings";

function AppContent() {
  const [currentView, setCurrentView] = useState<View>("chat");
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  });
  const {
    tasks,
    selectedTask,
    selectedTaskId,
    isLoading,
    error,
    setSelectedTaskId,
    createTask,
    deleteTask,
    stopTask,
    restartTask,
    updateTask,
    refresh: refreshTasks,
  } = useTasks();

  // Ref for focusing search input in sidebar
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Keyboard shortcuts handlers
  const handlePreviousTask = useCallback(() => {
    if (tasks.length === 0) return;
    const currentIndex = tasks.findIndex((t) => t.id === selectedTaskId);
    if (currentIndex > 0) {
      setSelectedTaskId(tasks[currentIndex - 1].id);
    } else if (currentIndex === -1) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [tasks, selectedTaskId, setSelectedTaskId]);

  const handleNextTask = useCallback(() => {
    if (tasks.length === 0) return;
    const currentIndex = tasks.findIndex((t) => t.id === selectedTaskId);
    if (currentIndex < tasks.length - 1) {
      setSelectedTaskId(tasks[currentIndex + 1].id);
    } else if (currentIndex === -1) {
      setSelectedTaskId(tasks[0].id);
    }
  }, [tasks, selectedTaskId, setSelectedTaskId]);

  const handleSelectTaskByIndex = useCallback(
    (index: number) => {
      if (index < tasks.length) {
        setSelectedTaskId(tasks[index].id);
        setCurrentView("chat");
      }
    },
    [tasks, setSelectedTaskId]
  );

  const handleCopyBranch = useCallback(async () => {
    if (selectedTask) {
      await writeText(selectedTask.branch);
    }
  }, [selectedTask]);

  const handleCreatePR = useCallback(() => {
    // This will be handled by the ChatView component
    // For now, we could open a modal or trigger the PR flow
    console.log("Create PR shortcut triggered");
  }, []);

  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
  }, []);

  const handleNewChat = useCallback(() => {
    setSelectedTaskId(null);
    setCurrentView("chat");
  }, [setSelectedTaskId]);

  const handleOpenSettings = useCallback(() => {
    setCurrentView("settings");
  }, []);

  const handleCloseSettings = useCallback(() => {
    setCurrentView("chat");
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
      if (currentView === "settings") {
        setCurrentView("chat");
      }
    },
    onFocusSearch: () => {
      searchInputRef.current?.focus();
    },
    onPreviousTask: handlePreviousTask,
    onNextTask: handleNextTask,
    onSelectTaskByIndex: handleSelectTaskByIndex,
    selectedTaskId,
    onStopTask: selectedTaskId ? () => stopTask(selectedTaskId) : undefined,
    onRestartTask: selectedTaskId ? () => restartTask(selectedTaskId) : undefined,
    onCopyBranch: handleCopyBranch,
    onCreatePR: handleCreatePR,
    isSettingsOpen: currentView === "settings",
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

  const handleCreateTask = async (repositoryPath: string, prompt: string, existingBranch?: string, baseBranch?: string) => {
    await createTask({ repository_path: repositoryPath, prompt, existing_branch: existingBranch, base_branch: baseBranch });
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
      className="h-screen flex"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      <Sidebar
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        onSelectTask={(id) => {
          setSelectedTaskId(id);
          setCurrentView("chat");
        }}
        onNewTask={handleNewChat}
        onOpenSettings={handleOpenSettings}
        onArchiveTasks={async (taskIds) => {
          await tauri.deleteTasks(taskIds);
          // If the currently selected task was archived, clear selection
          if (selectedTaskId && taskIds.includes(selectedTaskId)) {
            setSelectedTaskId(null);
          }
          // Refresh task list
          await refreshTasks();
        }}
        searchInputRef={searchInputRef}
        collapsed={sidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
      />

      {currentView === "settings" ? (
        <Settings
          onClose={handleCloseSettings}
          onRestartOnboarding={() => setShowOnboarding(true)}
        />
      ) : (
        <ChatView
          task={selectedTask}
          onCreateTask={handleCreateTask}
          onStop={stopTask}
          onRestart={restartTask}
          onDelete={deleteTask}
          onUpdateTask={updateTask}
        />
      )}
      <ToastContainer />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ReviewProvider>
          <AppContent />
        </ReviewProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}

export default App;
