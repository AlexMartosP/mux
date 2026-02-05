import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { PermissionRequest } from "../domains/tauri/commands";
import * as tauri from "../domains/tauri/commands";

interface PermissionTimeoutEvent {
  agent_id: string;
  request_id: string;
  tool_name: string;
  message: string;
}

interface PermissionsContextValue {
  // State
  allPendingRequests: PermissionRequest[];
  pendingAgentIds: Set<string>;

  // Actions
  dismissRequest: (requestId: string) => void;
  allowRequest: (requestId: string) => void;
  // Status
  isLoading: boolean;
}

// Notification functions
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

// Context
const PermissionsContext = createContext<PermissionsContextValue | null>(null);

// Provider Component
export function PermissionsProvider({ children }: { children: ReactNode }) {
  const [pendingRequests, setPendingRequests] = useState<PermissionRequest[]>([]);

  // Set up Tauri event listeners once
  useEffect(() => {
    let unlistenRequest: UnlistenFn | undefined;
    let unlistenResponse: UnlistenFn | undefined;
    let unlistenTimeout: UnlistenFn | undefined;

    // Listen for new permission requests
    listen<PermissionRequest>("permission-request", (event) => {
      console.log("[PermissionsContext] Received permission-request event:", event.payload);
      setPendingRequests(prev => [...prev, event.payload]);

      // Send system notification
      sendPermissionNotification(event.payload);
    }).then(fn => unlistenRequest = fn);

    // Listen for permission responses (cleanup)
    listen<{ request_id: string }>("permission-responded", (event) => {
      console.log("[PermissionsContext] Received permission-responded event:", event.payload);
      setPendingRequests(prev =>
        prev.filter(r => r.request_id !== event.payload.request_id)
      );
    }).then(fn => unlistenResponse = fn);

    // Listen for permission timeouts
    listen<PermissionTimeoutEvent>("permission-timeout", (event) => {
      console.log("[PermissionsContext] Received permission-timeout event:", event.payload);
      sendTimeoutNotification(event.payload);
    }).then(fn => unlistenTimeout = fn);

    console.log("[PermissionsContext] Event listeners set up");

    return () => {
      console.log("[PermissionsContext] Cleaning up event listeners");
      unlistenRequest?.();
      unlistenResponse?.();
      unlistenTimeout?.();
    };
  }, []);

  // Compute derived values
  const pendingAgentIds = useMemo(() => {
    const ids = new Set<string>();
    pendingRequests.forEach(req => ids.add(req.agent_id));
    return ids;
  }, [pendingRequests]);

  const respondPermission = useCallback((requestId: string, behavior: "allow" | "deny") => {
    tauri.respondPermission(requestId, behavior);
  }, []);

  const dismissRequest = useCallback((requestId: string) => {
    respondPermission(requestId, "deny");
    setPendingRequests(prev => prev.filter(r => r.request_id !== requestId));
  }, []);

  const allowRequest = useCallback((requestId: string) => {
    respondPermission(requestId, "allow");
    setPendingRequests(prev => prev.filter(r => r.request_id !== requestId));
  }, []);



  const value = useMemo(
    () => ({
      allPendingRequests: pendingRequests,
      pendingAgentIds,
      dismissRequest,
      isLoading: false,
      allowRequest,
    }),
    [pendingRequests, pendingAgentIds, dismissRequest, allowRequest]
  );

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

// Main hook - throws if not in provider
export function usePermissionsContext() {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error("usePermissionsContext must be used within PermissionsProvider");
  }
  return context;
}

// Convenience hook - filter by agent ID
export function useAgentPermissions(agentId: string | null | undefined) {
  const { allPendingRequests, dismissRequest, allowRequest } = usePermissionsContext();

  const filtered = useMemo(() => {
    if (!agentId) return [];
    return allPendingRequests.filter(r => r.agent_id === agentId);
  }, [allPendingRequests, agentId]);

  return {
    requests: filtered,
    dismissRequest: dismissRequest,
    allowRequest: allowRequest,
  };
}

// Convenience hook - get current request (FIFO)
export function useCurrentPermissionRequest(agentId: string | null | undefined) {
  const { requests } = useAgentPermissions(agentId);
  return requests.length > 0 ? requests[0] : null;
}

// Convenience hook - just pending agent IDs
export function usePendingAgentIds() {
  const { pendingAgentIds, dismissRequest, allowRequest } = usePermissionsContext();
  return { pendingAgentIds, dismissRequest, allowRequest };
}
