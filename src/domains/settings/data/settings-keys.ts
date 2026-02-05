export const settingsKeys = {
  all: ["settings"] as const,
  app: () => [...settingsKeys.all, "app"] as const,
  workspace: (workspaceId: string) =>
    [...settingsKeys.all, "workspace", workspaceId] as const,
};
