import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { OutputLine, OutputEvent } from "../types/agent";
import * as tauri from "../lib/tauri";
import {
  getCachedOutput,
  setCachedOutput,
  appendCachedOutput,
  clearCachedOutput,
} from "./useOutputCache";

const PAGE_SIZE = 200;
const BATCH_INTERVAL_MS = 50; // Batch events every 50ms for smoother rendering

export function useAgentOutput(agentId: string | null) {
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);

  // Buffer for batching incoming events
  const pendingOutputRef = useRef<OutputLine[]>([]);
  const flushTimeoutRef = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const agentIdRef = useRef<string | null>(null);
  // Track which agentId the pending output belongs to (captured when batch starts)
  const pendingTaskIdRef = useRef<string | null>(null);

  // Computed values
  const hasMore = loadedCount < totalCount;
  const remainingCount = totalCount - loadedCount;

  // Flush pending output to state (batched for performance)
  const flushPendingOutput = useCallback(() => {
    if (pendingOutputRef.current.length === 0) return;

    const pending = pendingOutputRef.current;
    // Capture the agentId this batch belongs to before clearing
    const batchTaskId = pendingTaskIdRef.current;
    pendingOutputRef.current = [];
    pendingTaskIdRef.current = null;
    flushTimeoutRef.current = null;

    // Only update state if we're still on the same task
    if (batchTaskId === agentIdRef.current) {
      setOutput((prev) => {
        const newOutput = prev.concat(pending);
        return newOutput;
      });
      setTotalCount((prev) => prev + pending.length);
      setLoadedCount((prev) => prev + pending.length);
    }

    // Update cache for the task the output belongs to
    if (batchTaskId) {
      appendCachedOutput(batchTaskId, pending);
    }
  }, []);

  // Save current state to cache when switching away
  useEffect(() => {
    agentIdRef.current = agentId;
  }, [agentId]);

  // Load initial output when task changes
  useEffect(() => {
    if (!agentId) {
      setOutput([]);
      setTotalCount(0);
      setLoadedCount(0);
      pendingOutputRef.current = [];
      return;
    }

    // Check cache first for immediate display
    const cached = getCachedOutput(agentId);
    if (cached && cached.output.length > 0) {
      setOutput(cached.output);
      setTotalCount(cached.totalCount);
      setLoadedCount(cached.loadedCount);
      setIsLoading(false);

      // Still validate cache against server in background
      tauri.getAgentOutputCount(agentId).then((serverCount) => {
        if (serverCount !== cached.totalCount) {
          // Cache is stale, re-fetch
          Promise.all([
            tauri.getAgentOutput(agentId, PAGE_SIZE, 0),
            Promise.resolve(serverCount),
          ]).then(([existingOutput, count]) => {
            setOutput(existingOutput);
            setTotalCount(count);
            setLoadedCount(existingOutput.length);
            setCachedOutput(agentId, {
              output: existingOutput,
              totalCount: count,
              loadedCount: existingOutput.length,
            });
          });
        }
      });
      return;
    }

    setIsLoading(true);

    // Fetch count and initial output in parallel
    Promise.all([
      tauri.getAgentOutput(agentId, PAGE_SIZE, 0),
      tauri.getAgentOutputCount(agentId),
    ])
      .then(([existingOutput, count]) => {
        setOutput(existingOutput);
        setTotalCount(count);
        setLoadedCount(existingOutput.length);

        // Store in cache
        setCachedOutput(agentId, {
          output: existingOutput,
          totalCount: count,
          loadedCount: existingOutput.length,
        });
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [agentId]);

  // Listen for new output with batching
  useEffect(() => {
    if (!agentId) return;

    const unlisten = listen<OutputEvent>("agent-output", (event) => {
      if (event.payload.agent_id === agentId) {
        // Add to pending buffer instead of updating state immediately
        pendingOutputRef.current.push({
          output_type: event.payload.output_type,
          content: event.payload.content,
          timestamp: event.payload.timestamp,
        });

        // Capture the agentId when we start a new batch
        if (pendingTaskIdRef.current === null) {
          pendingTaskIdRef.current = agentId;
        }

        // Schedule flush if not already scheduled
        if (flushTimeoutRef.current === null) {
          flushTimeoutRef.current = window.setTimeout(flushPendingOutput, BATCH_INTERVAL_MS);
        }
      }
    });

    return () => {
      unlisten.then((fn) => fn());
      // Flush any remaining output on cleanup
      if (flushTimeoutRef.current !== null) {
        clearTimeout(flushTimeoutRef.current);
        flushPendingOutput();
      }
    };
  }, [agentId, flushPendingOutput]);

  // Debounced auto-scroll to bottom when new output arrives
  // Only scrolls if user is already near the bottom (not reading old output)
  useEffect(() => {
    if (scrollTimeoutRef.current !== null) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = window.setTimeout(() => {
      if (outputRef.current) {
        const el = outputRef.current;
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        // Only auto-scroll if within 150px of the bottom
        if (distanceFromBottom < 150) {
          el.scrollTop = el.scrollHeight;
        }
      }
      scrollTimeoutRef.current = null;
    }, 100);

    return () => {
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [output]);

  // Load more output (older items)
  const loadMore = useCallback(async () => {
    if (!agentId || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const moreOutput = await tauri.getAgentOutput(agentId, PAGE_SIZE, loadedCount);

      // Use functional update and capture new state for cache
      setOutput((prev) => {
        const newOutput = prev.concat(moreOutput);
        // Update cache with the actual new output (not stale closure value)
        setCachedOutput(agentId, {
          output: newOutput,
          totalCount,
          loadedCount: loadedCount + moreOutput.length,
        });
        return newOutput;
      });
      setLoadedCount((prev) => prev + moreOutput.length);
    } catch (error) {
      console.error("Failed to load more output:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [agentId, isLoadingMore, hasMore, loadedCount, totalCount]);

  const clearOutput = useCallback(() => {
    setOutput([]);
    setTotalCount(0);
    setLoadedCount(0);
    pendingOutputRef.current = [];
    if (agentId) {
      clearCachedOutput(agentId);
    }
  }, [agentId]);

  return {
    output,
    isLoading,
    isLoadingMore,
    hasMore,
    remainingCount,
    totalCount,
    outputRef,
    loadMore,
    clearOutput,
  };
}

// Backwards compatibility alias
export const useTaskOutput = useAgentOutput;
