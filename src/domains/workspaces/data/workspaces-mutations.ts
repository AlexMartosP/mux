import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as tauri from "@/domains/tauri/commands";
import type { Workspace } from "@/types/agent";
import { workspaceKeys } from "./workspaces-keys";

/**
 * Mutation for creating a new workspace
 */
export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ name, reposFolderPath }: { name: string; reposFolderPath: string }) =>
      tauri.createWorkspace(name, reposFolderPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
    },
  });
}

/**
 * Mutation for updating a workspace
 */
export function useUpdateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      name,
      reposFolderPath,
    }: {
      id: string;
      name: string;
      reposFolderPath: string;
    }) => tauri.updateWorkspace(id, name, reposFolderPath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
    },
  });
}

/**
 * Mutation for deleting a workspace
 */
export function useDeleteWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => tauri.deleteWorkspace(id),
    onMutate: async (workspaceId) => {
      await queryClient.cancelQueries({ queryKey: workspaceKeys.lists() });

      const previousWorkspaces = queryClient.getQueryData<Workspace[]>(
        workspaceKeys.lists()
      );

      queryClient.setQueryData<Workspace[]>(workspaceKeys.lists(), (old) =>
        old?.filter((w) => w.id !== workspaceId)
      );

      return { previousWorkspaces };
    },
    onError: (_err, _workspaceId, context) => {
      if (context?.previousWorkspaces) {
        queryClient.setQueryData(
          workspaceKeys.lists(),
          context.previousWorkspaces
        );
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.lists() });
    },
  });
}

/**
 * Mutation for setting default workspace
 */
export function useSetDefaultWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => tauri.setDefaultWorkspace(id),
    onSuccess: (_data, workspaceId) => {
      queryClient.setQueryData<Workspace[]>(workspaceKeys.lists(), (old) =>
        old?.map((w) => ({
          ...w,
          is_default: w.id === workspaceId,
        }))
      );
    },
  });
}

/**
 * Mutation for adding a repository to a workspace
 */
export function useAddRepositoryToWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      repositoryPath,
      name,
    }: {
      workspaceId: string;
      repositoryPath: string;
      name: string;
    }) => tauri.addRepositoryToWorkspace(workspaceId, repositoryPath, name),
    onSuccess: (_data, { workspaceId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.repositories(workspaceId),
      });
    },
  });
}

/**
 * Mutation for removing a repository from a workspace
 */
export function useRemoveRepositoryFromWorkspace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      repositoryPath,
    }: {
      workspaceId: string;
      repositoryPath: string;
    }) => tauri.removeRepositoryFromWorkspace(workspaceId, repositoryPath),
    onSuccess: (_data, { workspaceId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.repositories(workspaceId),
      });
    },
  });
}
