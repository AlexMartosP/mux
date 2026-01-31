import { useState, useEffect, useCallback, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { PermissionRequest } from "../lib/tauri";
import * as tauri from "../lib/tauri";

interface PermissionTimeoutEvent {
  agent_id: string;
  request_id: string;
  tool_name: string;
  message: string;
}

// Global permission state - shared across all hook instances
let globalRequests: PermissionRequest[] = [];
let globalSetRequests: ((requests: PermissionRequest[]) => void) | null = null;
let listenerSetup = false;

async function sendPermissionNotification(request: PermissionRequest) {
  try {
    // Check if notifications are enabled for permissions
    const settings = await tauri.getSettings();
    if (!settings.prompt_for_permissions) return;

    const granted = await isPermissionGranted();
    if (!granted) return;

    // Get tool description
    let body = `${request.tool_name}`;
    if (request.tool_name === "Bash" && request.tool_input.command) {
      body = `Bash: ${String(request.tool_input.command).slice(0, 50)}`;
    } else if (request.tool_input.file_path) {
      body = `${request.tool_name}: ${request.tool_input.file_path}`;
    }

    sendNotification({
      title: "Permission Required",
      body,
    });
  } catch {
    // Silently fail if notification can't be sent
  }
}

async function sendTimeoutNotification(event: PermissionTimeoutEvent) {
  try {
    const granted = await isPermissionGranted();
    if (!granted) return;

    sendNotification({
      title: "Agent Paused - Approval Needed",
      body: `${event.tool_name} is waiting for your approval. Agent will resume when approved.`,
    });
  } catch {
    // Silently fail if notification can't be sent
  }
}

export function usePermissions(agentId?: string | null) {
  const [pendingRequests, setPendingRequests] = useState<PermissionRequest[]>(globalRequests);

  // Set global setter on mount
  useEffect(() => {
    globalSetRequests = setPendingRequests;
    setPendingRequests(globalRequests);

    return () => {
      if (globalSetRequests === setPendingRequests) {
        globalSetRequests = null;
      }
    };
  }, []);

  useEffect(() => {
    // Only set up listener once globally
    if (listenerSetup) return;
    listenerSetup = true;

    const unlistenRequestPromise = listen<PermissionRequest>("permission-request", (event) => {
      globalRequests = [...globalRequests, event.payload];
      setPendingRequests(globalRequests);
      if (globalSetRequests && globalSetRequests !== setPendingRequests) {
        globalSetRequests(globalRequests);
      }

      // Send system notification
      sendPermissionNotification(event.payload);
    });

    // Listen for permission timeouts
    // Note: We do NOT remove the request from pending - it stays visible for user to respond
    // When user responds, the task will restart with the permission pre-approved
    const unlistenTimeoutPromise = listen<PermissionTimeoutEvent>("permission-timeout", (event) => {
      // Send system notification about the timeout (task paused, waiting for approval)
      sendTimeoutNotification(event.payload);
    });

    // Listen for permission responses from backend to reliably clean up
    const unlistenResponsePromise = listen<{ request_id: string }>("permission-responded", (event) => {
      const requestId = event.payload.request_id;
      globalRequests = globalRequests.filter((r) => r.request_id !== requestId);
      setPendingRequests(globalRequests);
      if (globalSetRequests && globalSetRequests !== setPendingRequests) {
        globalSetRequests(globalRequests);
      }
    });

    return () => {
      listenerSetup = false;
      unlistenRequestPromise.then((unlisten) => unlisten());
      unlistenTimeoutPromise.then((unlisten) => unlisten());
      unlistenResponsePromise.then((unlisten) => unlisten());
    };
  }, []);

  const dismissRequest = useCallback((requestId: string) => {
    globalRequests = globalRequests.filter((r) => r.request_id !== requestId);
    setPendingRequests(globalRequests);
    if (globalSetRequests && globalSetRequests !== setPendingRequests) {
      globalSetRequests(globalRequests);
    }
  }, []);

  // Filter by agent_id if provided
  const filteredRequests = useMemo(() => {
    if (!agentId) return pendingRequests;
    return pendingRequests.filter((r) => r.agent_id === agentId);
  }, [pendingRequests, agentId]);

  // Get the first pending request for this agent (FIFO)
  const currentRequest = filteredRequests.length > 0 ? filteredRequests[0] : null;

  // Get all agent IDs with pending permissions
  const pendingAgentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const req of pendingRequests) {
      ids.add(req.agent_id);
    }
    return ids;
  }, [pendingRequests]);

  return {
    currentRequest,
    pendingCount: filteredRequests.length,
    totalPendingCount: pendingRequests.length,
    pendingAgentIds,
    allPendingRequests: pendingRequests,
    dismissRequest,
  };
}
