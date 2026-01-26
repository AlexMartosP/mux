import { useState, useEffect, useCallback, useMemo } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { PermissionRequest } from "../lib/tauri";
import * as tauri from "../lib/tauri";

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

export function usePermissions(taskId?: string | null) {
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

    const unlistenPromise = listen<PermissionRequest>("permission-request", (event) => {
      globalRequests = [...globalRequests, event.payload];
      setPendingRequests(globalRequests);
      if (globalSetRequests && globalSetRequests !== setPendingRequests) {
        globalSetRequests(globalRequests);
      }

      // Send system notification
      sendPermissionNotification(event.payload);
    });

    return () => {
      listenerSetup = false;
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const dismissRequest = useCallback((requestId: string) => {
    globalRequests = globalRequests.filter((r) => r.request_id !== requestId);
    setPendingRequests(globalRequests);
    if (globalSetRequests && globalSetRequests !== setPendingRequests) {
      globalSetRequests(globalRequests);
    }
  }, []);

  // Filter by task_id if provided
  const filteredRequests = useMemo(() => {
    if (!taskId) return pendingRequests;
    return pendingRequests.filter((r) => r.task_id === taskId);
  }, [pendingRequests, taskId]);

  // Get the first pending request for this task (FIFO)
  const currentRequest = filteredRequests.length > 0 ? filteredRequests[0] : null;

  // Get all task IDs with pending permissions
  const pendingTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const req of pendingRequests) {
      ids.add(req.task_id);
    }
    return ids;
  }, [pendingRequests]);

  return {
    currentRequest,
    pendingCount: filteredRequests.length,
    totalPendingCount: pendingRequests.length,
    pendingTaskIds,
    dismissRequest,
  };
}
