export const chatKeys = {
  all: ["chat"] as const,
  messages: (agentId: string) => [...chatKeys.all, "messages", agentId] as const,
  // Legacy: for backward compatibility with old OutputLine format
  legacyMessages: (agentId: string) => [...chatKeys.all, "legacy-messages", agentId] as const,
};
