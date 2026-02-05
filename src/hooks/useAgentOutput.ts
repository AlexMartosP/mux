import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { OutputLine, OutputEvent } from "../types/agent";
import * as tauri from "../domains/tauri/commands";
import {
  getCachedOutput,
  setCachedOutput,
  appendCachedOutput,
  clearCachedOutput,
} from "./useOutputCache";

const PAGE_SIZE = 200;
const BATCH_INTERVAL_MS = 50; // Batch events every 50ms for smoother rendering
const SCROLL_THRESHOLD = 200; // Pixels from top to trigger infinite scroll

export function useAgentOutput(agentId: string | null) {
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  // Track the lowest offset we've loaded (for loading older messages)
  const [oldestOffsetLoaded, setOldestOffsetLoaded] = useState(0);
  const outputRef = useRef<HTMLDivElement>(null);
  // Ref to track if we should preserve scroll position after prepending
  const shouldPreserveScrollRef = useRef(false);
  const previousScrollHeightRef = useRef(0);

  // Buffer for batching incoming events
  const pendingOutputRef = useRef<OutputLine[]>([]);
  const flushTimeoutRef = useRef<number | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);
  const agentIdRef = useRef<string | null>(null);
  // Track which agentId the pending output belongs to (captured when batch starts)
  const pendingTaskIdRef = useRef<string | null>(null);

  // Computed values - hasMore means there are older messages to load
  const hasMore = oldestOffsetLoaded > 0;
  const remainingCount = oldestOffsetLoaded;

  // Flush pending output to state (batched for performance)
  // New output is appended at the end (newest messages)
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
  // Now loads NEWEST messages first (from the end of the output)
  useEffect(() => {
    if (!agentId) {
      setOutput([]);
      setTotalCount(0);
      setOldestOffsetLoaded(0);
      pendingOutputRef.current = [];
      return;
    }

    // Check cache first for immediate display
    const cached = getCachedOutput(agentId);
    if (cached && cached.output.length > 0) {
      setOutput(cached.output);
      setTotalCount(cached.totalCount);
      setOldestOffsetLoaded(cached.loadedCount > 0 ? Math.max(0, cached.totalCount - cached.loadedCount) : 0);
      setIsLoading(false);

      // Still validate cache against server in background
      tauri.getAgentOutputCount(agentId).then((serverCount) => {
        if (serverCount !== cached.totalCount) {
          // Cache is stale, re-fetch newest messages
          const initialOffset = Math.max(0, serverCount - PAGE_SIZE);
          tauri.getAgentOutput(agentId, PAGE_SIZE, initialOffset).then((existingOutput) => {
            setOutput(existingOutput);
            setTotalCount(serverCount);
            setOldestOffsetLoaded(initialOffset);
            setCachedOutput(agentId, {
              output: existingOutput,
              totalCount: serverCount,
              loadedCount: existingOutput.length,
            });
          });
        }
      });
      return;
    }

    setIsLoading(true);

    // First get the count, then load from the end (newest messages)
    tauri.getAgentOutputCount(agentId)
      .then((count) => {
        // Calculate offset to get newest messages
        const initialOffset = Math.max(0, count - PAGE_SIZE);
        return tauri.getAgentOutput(agentId, PAGE_SIZE, initialOffset).then((existingOutput) => {
          setOutput(existingOutput);
          setTotalCount(count);
          setOldestOffsetLoaded(initialOffset);

          // Store in cache
          setCachedOutput(agentId, {
            output: existingOutput,
            totalCount: count,
            loadedCount: existingOutput.length,
          });
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

  // Load more output (OLDER items - prepended to the beginning)
  const loadMore = useCallback(async () => {
    if (!agentId || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);

    // Save scroll position before loading
    if (outputRef.current) {
      previousScrollHeightRef.current = outputRef.current.scrollHeight;
      shouldPreserveScrollRef.current = true;
    }

    try {
      // Load older messages (lower offset)
      const newOffset = Math.max(0, oldestOffsetLoaded - PAGE_SIZE);
      const limit = oldestOffsetLoaded - newOffset; // May be less than PAGE_SIZE near the beginning

      const olderOutput = await tauri.getAgentOutput(agentId, limit, newOffset);

      // Prepend older messages to the beginning
      setOutput((prev) => {
        const newOutput = olderOutput.concat(prev);
        // Update cache
        setCachedOutput(agentId, {
          output: newOutput,
          totalCount,
          loadedCount: newOutput.length,
        });
        return newOutput;
      });
      setOldestOffsetLoaded(newOffset);
    } catch (error) {
      console.error("Failed to load more output:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [agentId, isLoadingMore, hasMore, oldestOffsetLoaded, totalCount]);

  const clearOutput = useCallback(() => {
    setOutput([]);
    setTotalCount(0);
    setOldestOffsetLoaded(0);
    pendingOutputRef.current = [];
    if (agentId) {
      clearCachedOutput(agentId);
    }
  }, [agentId]);

  // Preserve scroll position after prepending older messages
  useEffect(() => {
    if (shouldPreserveScrollRef.current && outputRef.current) {
      const newScrollHeight = outputRef.current.scrollHeight;
      const scrollDiff = newScrollHeight - previousScrollHeightRef.current;
      outputRef.current.scrollTop += scrollDiff;
      shouldPreserveScrollRef.current = false;
    }
  }, [output]);

  // Infinite scroll - detect when user scrolls near the top
  useEffect(() => {
    const container = outputRef.current;
    if (!container || !hasMore) return;

    const handleScroll = () => {
      // Check if near the top (within SCROLL_THRESHOLD pixels)
      if (container.scrollTop < SCROLL_THRESHOLD && !isLoadingMore && hasMore) {
        loadMore();
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [hasMore, isLoadingMore, loadMore]);

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
