import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { useWorkspacesQuery } from "@/domains/workspaces/data/workspaces-queries";
import type { Workspace } from "@/types/agent";

const SELECTED_WORKSPACE_KEY = "mux-selected-workspace";

interface WorkspaceContextValue {
  workspaces: Workspace[];
  selectedWorkspaceId: string;
  setSelectedWorkspaceId: (id: string | null) => void;
  isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data: workspaces = [], isLoading } = useWorkspacesQuery();

  const [selectedWorkspaceId, setSelectedWorkspaceIdState] = useState<string | null>(
    () => localStorage.getItem(SELECTED_WORKSPACE_KEY)
  );

  // Fall back to default workspace if none selected
  useEffect(() => {
    const defaultWorkspaceId = workspaces.find((w) => w.is_default)?.id;

    if (!selectedWorkspaceId && defaultWorkspaceId) {
      setSelectedWorkspaceIdState(defaultWorkspaceId);
      localStorage.setItem(SELECTED_WORKSPACE_KEY, defaultWorkspaceId);
    }
  }, [selectedWorkspaceId, workspaces]);

  const setSelectedWorkspaceId = useCallback((workspaceId: string | null) => {
    setSelectedWorkspaceIdState(workspaceId);
    if (workspaceId) {
      localStorage.setItem(SELECTED_WORKSPACE_KEY, workspaceId);
    } else {
      localStorage.removeItem(SELECTED_WORKSPACE_KEY);
    }
  }, []);

  if (!selectedWorkspaceId) {
    return null;
  }

  return (
    <WorkspaceContext.Provider
      value={{
        workspaces,
        selectedWorkspaceId,
        setSelectedWorkspaceId,
        isLoading,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return context;
}

/**
 * Hook to get just the selected workspace ID (convenience hook)
 */
export function useSelectedWorkspaceId(): string {
  const { selectedWorkspaceId } = useWorkspace();
  return selectedWorkspaceId;
}
