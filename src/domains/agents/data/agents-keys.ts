export const agentKeys = {
  all: ["agents"] as const,
  lists: () => [...agentKeys.all, "list"] as const,
  byWorkspace: (workspaceId: string) =>
    [...agentKeys.all, "list", { workspaceId }] as const,
  detail: (id: string) => [...agentKeys.all, "detail", id] as const,
  setupProgress: () => [...agentKeys.all, "setupProgress"] as const,
  changes: (agentId: string) => [...agentKeys.all, "changes", agentId] as const,
  fileChanges: (agentId: string) =>
    [...agentKeys.all, "fileChanges", agentId] as const,
};
