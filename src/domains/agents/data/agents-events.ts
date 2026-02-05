import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { Agent, SetupStage, SetupProgressEvent } from "@/types/agent";
import { agentKeys } from "./agents-keys";
import { getCachedSettings } from "@/hooks/useSettings";

/**
 * Hook that sets up Tauri event listeners and syncs them to the query cache.
 * Call this once at the app layout level.
 */
export function useAgentEvents() {
  const queryClient = useQueryClient();

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

  // Listen for unified agent updates (replaces agent-status, agent-metadata, agent-cost, agent-description)
  useEffect(() => {
    const unlisten = listen<Agent>("agent-updated", (event) => {
      const agent = event.payload;

      // Update all agent list caches (workspace-scoped)
      queryClient.setQueriesData<Agent[]>(
        { queryKey: agentKeys.all },
        (old) => {
          if (!old) return [agent];
          const exists = old.some((a) => a.id === agent.id);
          if (exists) {
            return old.map((a) => (a.id === agent.id ? agent : a));
          }
          return [...old, agent];
        }
      );

      // Update detail cache
      queryClient.setQueryData(agentKeys.detail(agent.id), agent);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [queryClient]);

  // Listen for notifications
  useEffect(() => {
    const unlisten = listen<{
      agent_id: string;
      title: string;
      body: string;
      notification_type?: string;
    }>("agent-notification", async (event) => {
      const { title, body, notification_type } = event.payload;

      // Check notification settings (using cached settings)
      try {
        const settings = await getCachedSettings();
        if (settings) {
          const isCompletion =
            notification_type === "completed" || title.includes("Completed");
          const isError =
            notification_type === "error" ||
            title.includes("Failed") ||
            title.includes("Error");

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
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for setup progress events (for setup UI, not cache updates)
  useEffect(() => {
    const unlisten = listen<SetupProgressEvent>(
      "agent-setup-progress",
      (event) => {
        const { agent_id, stage } = event.payload;

        queryClient.setQueryData<Record<string, SetupStage>>(
          agentKeys.setupProgress(),
          (old) => ({
            ...old,
            [agent_id]: stage,
          })
        );
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [queryClient]);
}
