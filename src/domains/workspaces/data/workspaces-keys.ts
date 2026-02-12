export const workspaceKeys = {
  all: ["workspaces"] as const,
  lists: () => [...workspaceKeys.all, "list"] as const,
  detail: (id: string) => [...workspaceKeys.all, "detail", id] as const,
  repositories: (id: string) => [...workspaceKeys.all, "repos", id] as const,
  settings: (id: string) => [...workspaceKeys.all, "settings", id] as const,
  githubAuth: (id: string) => [...workspaceKeys.all, "github-auth", id] as const,
};
