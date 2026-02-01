import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { Agent, SpawnAgentInput, StatusEvent, DescriptionEvent, AgentMetadataEvent } from "../types/agent";
import * as tauri from "../lib/tauri";
import { getCachedSettings } from "./useSettings";

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  const loadAgents = useCallback(async () => {
    try {
      const loadedAgents = await tauri.getAgents();
      setAgents(loadedAgents);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAgents();
  }, [loadAgents]);

  // Request notification permission on mount
  useEffect(() => {
    async function setupNotifications() {
      const granted = await isPermissionGranted();
      if (!granted) {
        await requestPermission();
      }
    }
    setupNotifications();
  }, []);

  // Listen for status changes
  useEffect(() => {
    const unlisten = listen<StatusEvent>("agent-status", (event) => {
      const { agent_id, status } = event.payload;

      setAgents((prev) =>
        prev.map((agent) =>
          agent.id === agent_id ? { ...agent, status: status as Agent["status"] } : agent
        )
      );
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for notifications
  useEffect(() => {
    const unlisten = listen<{ agent_id: string; title: string; body: string; notification_type?: string }>(
      "agent-notification",
      async (event) => {
        const { title, body, notification_type } = event.payload;

        // Check notification settings (using cached settings)
        try {
          const settings = await getCachedSettings();
          if (settings) {
            const isCompletion = notification_type === "completed" || title.includes("Completed");
            const isError = notification_type === "error" || title.includes("Failed") || title.includes("Error");

            // Skip notification if disabled in settings
            if (isCompletion && !settings.notify_on_completion) return;
            if (isError && !settings.notify_on_error) return;
          }
        } catch {
          // If settings can't be fetched, show notification anyway
        }

        const granted = await isPermissionGranted();
        if (granted) {
          sendNotification({ title, body });
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for description updates
  useEffect(() => {
    const unlisten = listen<DescriptionEvent>("agent-description", (event) => {
      const { agent_id, description } = event.payload;

      setAgents((prev) =>
        prev.map((agent) =>
          agent.id === agent_id ? { ...agent, description } : agent
        )
      );
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for cost updates
  useEffect(() => {
    const unlisten = listen<{ agent_id: string; cost_usd: number; input_tokens: number; output_tokens: number }>(
      "agent-cost",
      (event) => {
        const { agent_id, cost_usd, input_tokens, output_tokens } = event.payload;
        setAgents((prev) =>
          prev.map((agent) =>
            agent.id === agent_id
              ? {
                  ...agent,
                  total_cost_usd: (agent.total_cost_usd ?? 0) + cost_usd,
                  total_input_tokens: (agent.total_input_tokens ?? 0) + input_tokens,
                  total_output_tokens: (agent.total_output_tokens ?? 0) + output_tokens,
                }
              : agent
          )
        );
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for metadata updates (from background generation)
  useEffect(() => {
    const unlisten = listen<AgentMetadataEvent>("agent-metadata", (event) => {
      const { agent_id, name, description, branch, worktree_path } = event.payload;

      setAgents((prev) =>
        prev.map((agent) =>
          agent.id === agent_id
            ? { ...agent, name, description, branch, worktree_path, metadata_loading: false }
            : agent
        )
      );
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const spawnAgent = useCallback(async (input: SpawnAgentInput) => {
    const newAgent = await tauri.spawnAgent(input);
    setAgents((prev) => [newAgent, ...prev]);
    setSelectedAgentId(newAgent.id);
    return newAgent;
  }, []);

  const deleteAgent = useCallback(
    async (id: string) => {
      await tauri.deleteAgent(id);
      setAgents((prev) => prev.filter((a) => a.id !== id));
      if (selectedAgentId === id) {
        setSelectedAgentId(null);
      }
    },
    [selectedAgentId]
  );

  const stopAgent = useCallback(
    async (id: string) => {
      await tauri.stopAgent(id);
      // Status will be updated via event listener
    },
    []
  );

  const restartAgent = useCallback(
    async (id: string, prompt?: string) => {
      await tauri.restartAgent(id, prompt);
      // Status will be updated via event listener
    },
    []
  );

  const updateAgent = useCallback((updatedAgent: Agent) => {
    setAgents((prev) =>
      prev.map((agent) =>
        agent.id === updatedAgent.id ? updatedAgent : agent
      )
    );
  }, []);

  return {
    agents,
    selectedAgent,
    selectedAgentId,
    isLoading,
    error,
    setSelectedAgentId,
    spawnAgent,
    deleteAgent,
    stopAgent,
    restartAgent,
    updateAgent,
    refresh: loadAgents,
  };
}

// Backwards compatibility alias
export const useTasks = useAgents;
