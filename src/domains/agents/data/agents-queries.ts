import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import * as tauri from "@/domains/tauri/commands";
import type { Agent, SetupStage } from "@/types/agent";
import { agentKeys } from "./agents-keys";
import { useSelectedWorkspaceId } from "@/contexts/WorkspaceContext";

/**
 * Query for fetching agents in the selected workspace
 */
export function useAgentsQuery() {
  const workspaceId = useSelectedWorkspaceId();

  return useQuery({
    queryKey: agentKeys.byWorkspace(workspaceId),
    queryFn: () => tauri.getAgentsByWorkspace(workspaceId),
    staleTime: 0, // Always refetch since we rely on events for updates
  });
}

/**
 * Derive a single agent from the agents list
 */
export function useAgentQuery(id: string | null) {
  const { data: agents } = useAgentsQuery();
  return useMemo(
    () => (id ? agents?.find((a) => a.id === id) ?? null : null),
    [agents, id]
  );
}

/**
 * Query for setup progress state (managed via events)
 */
export function useSetupProgressQuery() {
  return useQuery({
    queryKey: agentKeys.setupProgress(),
    queryFn: () => ({} as Record<string, SetupStage>),
    staleTime: Infinity, // Only updated via events
  });
}

/**
 * Hook to get setup progress setter (for use in event handlers)
 */
export function useSetupProgressSetter() {
  const queryClient = useQueryClient();

  return (agentId: string, stage: SetupStage) => {
    queryClient.setQueryData<Record<string, SetupStage>>(
      agentKeys.setupProgress(),
      (old) => ({
        ...old,
        [agentId]: stage,
      })
    );
  };
}

/**
 * Hook to update agents in the query cache
 */
export function useAgentsCacheSetter() {
  const queryClient = useQueryClient();
  const workspaceId = useSelectedWorkspaceId();

  return {
    updateAgent: (agentId: string, updates: Partial<Agent>) => {
      queryClient.setQueryData<Agent[]>(agentKeys.byWorkspace(workspaceId), (old) =>
        old?.map((agent) =>
          agent.id === agentId ? { ...agent, ...updates } : agent
        )
      );
    },
    addAgent: (agent: Agent) => {
      queryClient.setQueryData<Agent[]>(agentKeys.byWorkspace(workspaceId), (old) =>
        old ? [agent, ...old] : [agent]
      );
    },
    removeAgent: (agentId: string) => {
      queryClient.setQueryData<Agent[]>(agentKeys.byWorkspace(workspaceId), (old) =>
        old?.filter((agent) => agent.id !== agentId)
      );
    },
    invalidate: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.byWorkspace(workspaceId) });
    },
  };
}
