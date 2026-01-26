import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { ChatView } from "./components/ChatView";
import { Settings } from "./components/Settings";
import { Onboarding } from "./components/Onboarding";
import { useTasks } from "./hooks/useTasks";
import { ReviewProvider } from "./contexts/ReviewContext";
import * as tauri from "./lib/tauri";

type View = "chat" | "settings";

function App() {
  const [currentView, setCurrentView] = useState<View>("chat");
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
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

  const handleOnboardingComplete = () => {
    setShowOnboarding(false);
  };

  const handleNewChat = () => {
    setSelectedTaskId(null);
    setCurrentView("chat");
  };

  const handleOpenSettings = () => {
    setCurrentView("settings");
  };

  const handleCloseSettings = () => {
    setCurrentView("chat");
  };

  const handleCreateTask = async (repositoryPath: string, prompt: string) => {
    await createTask({ repository_path: repositoryPath, prompt });
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
    <ReviewProvider>
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
      </div>
    </ReviewProvider>
  );
}

export default App;
