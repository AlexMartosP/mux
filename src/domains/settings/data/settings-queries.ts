import { useQuery } from "@tanstack/react-query";
import * as tauri from "@/domains/tauri/commands";
import { settingsKeys } from "./settings-keys";

/**
 * Query for fetching app settings
 */
export function useSettingsQuery() {
  return useQuery({
    queryKey: settingsKeys.app(),
    queryFn: tauri.getSettings,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Query for fetching workspace-specific settings
 */
export function useWorkspaceSettingsQuery(workspaceId: string | null) {
  return useQuery({
    queryKey: settingsKeys.workspace(workspaceId ?? ""),
    queryFn: () =>
      workspaceId ? tauri.getAllWorkspaceSettings(workspaceId) : {},
    enabled: !!workspaceId,
    staleTime: 60_000, // 1 minute
  });
}
