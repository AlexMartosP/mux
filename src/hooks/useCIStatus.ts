import { useState, useEffect, useCallback, useRef } from "react";
import type { Agent, CIStatus, CIStatusResponse } from "../types/agent";
import * as tauri from "../lib/tauri";

// Cache CI status to avoid excessive API calls
const ciStatusCache = new Map<string, { status: CIStatusResponse; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

interface UseCIStatusOptions {
  pollInterval?: number; // Default 60 seconds
}

export function useCIStatus(agents: Agent[], options: UseCIStatusOptions = {}) {
  const { pollInterval = 60000 } = options;
  const [ciStatuses, setCIStatuses] = useState<Map<string, CIStatus>>(new Map());
  const isMounted = useRef(true);

  const fetchCIStatus = useCallback(async (prUrl: string): Promise<CIStatus> => {
    // Check cache first
    const cached = ciStatusCache.get(prUrl);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.status.status;
    }

    try {
      const response = await tauri.getCIStatus(prUrl);
      ciStatusCache.set(prUrl, { status: response, timestamp: Date.now() });
      return response.status;
    } catch (error) {
      console.error("Failed to fetch CI status:", error);
      return "no_ci";
    }
  }, []);

  const refreshAll = useCallback(async () => {
    const agentsWithPRs = agents.filter((agent) => agent.pr_url);
    if (agentsWithPRs.length === 0) return;

    const newStatuses = new Map<string, CIStatus>();

    // Fetch in parallel with a concurrency limit
    const CONCURRENCY_LIMIT = 5;
    for (let i = 0; i < agentsWithPRs.length; i += CONCURRENCY_LIMIT) {
      const batch = agentsWithPRs.slice(i, i + CONCURRENCY_LIMIT);
      const results = await Promise.all(
        batch.map(async (agent) => {
          const status = await fetchCIStatus(agent.pr_url!);
          return { agentId: agent.id, status };
        })
      );

      for (const { agentId, status } of results) {
        newStatuses.set(agentId, status);
      }
    }

    if (isMounted.current) {
      setCIStatuses(newStatuses);
    }
  }, [agents, fetchCIStatus]);

  // Initial fetch and polling
  useEffect(() => {
    isMounted.current = true;
    refreshAll();

    const intervalId = setInterval(refreshAll, pollInterval);

    return () => {
      isMounted.current = false;
      clearInterval(intervalId);
    };
  }, [refreshAll, pollInterval]);

  // Refresh on window focus
  useEffect(() => {
    const handleFocus = () => {
      refreshAll();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [refreshAll]);

  const getCIStatusForAgent = useCallback(
    (agentId: string): CIStatus | undefined => {
      return ciStatuses.get(agentId);
    },
    [ciStatuses]
  );

  return {
    ciStatuses,
    getCIStatusForAgent,
    refreshAll,
  };
}
