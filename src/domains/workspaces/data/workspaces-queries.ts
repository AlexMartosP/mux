import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import * as tauri from "@/domains/tauri/commands";
import { workspaceKeys } from "./workspaces-keys";

/**
 * Query for fetching all workspaces
 */
export function useWorkspacesQuery() {
  return useQuery({
    queryKey: workspaceKeys.lists(),
    queryFn: tauri.getWorkspaces,
    staleTime: 60_000, // 1 minute - workspaces change infrequently
  });
}

/**
 * Query for fetching repositories in a workspace
 */
export function useWorkspaceRepositoriesQuery(workspaceId: string) {
  return useQuery({
    queryKey: workspaceKeys.repositories(workspaceId),
    queryFn: () => tauri.getWorkspaceRepositories(workspaceId)
  });
}
