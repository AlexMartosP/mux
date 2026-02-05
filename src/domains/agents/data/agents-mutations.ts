import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as tauri from "@/domains/tauri/commands";
import type { Agent, SpawnAgentInput } from "@/types/agent";
import { agentKeys } from "./agents-keys";

/**
 * Mutation for spawning a new agent
 */
export function useSpawnAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SpawnAgentInput) => tauri.spawnAgent(input),
    onSuccess: (newAgent) => {
      // Add the new agent to the cache
      queryClient.setQueryData<Agent[]>(agentKeys.lists(), (old) =>
        old ? [newAgent, ...old] : [newAgent]
      );
    },
  });
}

/**
 * Mutation for deleting an agent
 */
export function useDeleteAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => tauri.deleteAgent(id),
    onMutate: async (agentId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: agentKeys.lists() });

      // Snapshot previous value
      const previousAgents = queryClient.getQueryData<Agent[]>(agentKeys.lists());

      // Optimistically remove from list
      queryClient.setQueryData<Agent[]>(agentKeys.lists(), (old) =>
        old?.filter((a) => a.id !== agentId)
      );

      return { previousAgents };
    },
    onError: (_err, _agentId, context) => {
      // Rollback on error
      if (context?.previousAgents) {
        queryClient.setQueryData(agentKeys.lists(), context.previousAgents);
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() });
    },
  });
}

/**
 * Mutation for stopping an agent
 */
export function useStopAgent() {
  return useMutation({
    mutationFn: (id: string) => tauri.stopAgent(id),
    // Status will be updated via event listener
  });
}

/**
 * Mutation for restarting an agent
 */
export function useRestartAgent() {
  return useMutation({
    mutationFn: ({ id, prompt }: { id: string; prompt?: string }) =>
      tauri.restartAgent(id, prompt),
    // Status will be updated via event listener
  });
}

/**
 * Mutation for updating an agent's name
 */
export function useUpdateAgentName() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      tauri.updateAgentName(id, name),
    onSuccess: (_data, { id, name }) => {
      queryClient.setQueryData<Agent[]>(agentKeys.lists(), (old) =>
        old?.map((agent) => (agent.id === id ? { ...agent, name } : agent))
      );
    },
  });
}

/**
 * Mutation for updating an agent's description
 */
export function useUpdateAgentDescription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, description }: { id: string; description: string }) =>
      tauri.updateAgentDescription(id, description),
    onSuccess: (_data, { id, description }) => {
      queryClient.setQueryData<Agent[]>(agentKeys.lists(), (old) =>
        old?.map((agent) =>
          agent.id === id ? { ...agent, description } : agent
        )
      );
    },
  });
}

/**
 * Mutation for setting auto-accept edits
 */
export function useSetAgentAutoAcceptEdits() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      tauri.setAgentAutoAcceptEdits(id, enabled),
    onSuccess: (_data, { id }) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(id) });
    },
  });
}

/**
 * Mutation for setting agent pinned status
 */
export function useSetAgentPinned() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      tauri.setAgentPinned(id, pinned),
    onSuccess: (_data, { id, pinned }) => {
      queryClient.setQueryData<Agent[]>(agentKeys.lists(), (old) =>
        old?.map((agent) =>
          agent.id === id ? { ...agent, pinned } : agent
        )
      );
    },
  });
}
