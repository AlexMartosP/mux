import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as tauri from "@/domains/tauri/commands";
import type { AppSettings } from "@/domains/tauri/commands";
import { settingsKeys } from "./settings-keys";

/**
 * Mutation for updating app settings
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (settings: AppSettings) => tauri.updateSettings(settings),
    onSuccess: (_data, settings) => {
      queryClient.setQueryData(settingsKeys.app(), settings);
    },
  });
}

/**
 * Mutation for setting a single setting
 */
export function useSetSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      tauri.setSetting(key, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.app() });
    },
  });
}

/**
 * Mutation for setting a workspace-specific setting
 */
export function useSetWorkspaceSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      workspaceId,
      key,
      value,
    }: {
      workspaceId: string;
      key: string;
      value: string;
    }) => tauri.setWorkspaceSetting(workspaceId, key, value),
    onSuccess: (_data, { workspaceId }) => {
      queryClient.invalidateQueries({
        queryKey: settingsKeys.workspace(workspaceId),
      });
    },
  });
}

/**
 * Mutation for deleting a workspace-specific setting
 */
export function useDeleteWorkspaceSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ workspaceId, key }: { workspaceId: string; key: string }) =>
      tauri.deleteWorkspaceSetting(workspaceId, key),
    onSuccess: (_data, { workspaceId }) => {
      queryClient.invalidateQueries({
        queryKey: settingsKeys.workspace(workspaceId),
      });
    },
  });
}
