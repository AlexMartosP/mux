export const agentKeys = {
  all: ["agents"] as const,
  lists: () => [...agentKeys.all, "list"] as const,
  byWorkspace: (workspaceId: string) =>
    [...agentKeys.all, "list", { workspaceId }] as const,
  detail: (id: string) => [...agentKeys.all, "detail", id] as const,
  setupProgress: () => [...agentKeys.all, "setupProgress"] as const,
};
