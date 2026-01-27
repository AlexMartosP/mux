import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { OutputLine, OutputEvent } from "../types/task";
import * as tauri from "../lib/tauri";

const PAGE_SIZE = 200;
const BATCH_INTERVAL_MS = 50; // Batch events every 50ms for smoother rendering

export function useTaskOutput(taskId: string | null) {
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

  // Computed values
  const hasMore = loadedCount < totalCount;
  const remainingCount = totalCount - loadedCount;

  // Flush pending output to state (batched for performance)
  const flushPendingOutput = useCallback(() => {
    if (pendingOutputRef.current.length === 0) return;

    const pending = pendingOutputRef.current;
    pendingOutputRef.current = [];
    flushTimeoutRef.current = null;

    setOutput((prev) => {
      // Use concat instead of spread for better performance with large arrays
      const newOutput = prev.concat(pending);
      return newOutput;
    });
    setTotalCount((prev) => prev + pending.length);
    setLoadedCount((prev) => prev + pending.length);
  }, []);

  // Load initial output when task changes
  useEffect(() => {
    if (!taskId) {
      setOutput([]);
      setTotalCount(0);
      setLoadedCount(0);
      pendingOutputRef.current = [];
      return;
    }

    setIsLoading(true);

    // Fetch count and initial output in parallel
    Promise.all([
      tauri.getTaskOutput(taskId, PAGE_SIZE, 0),
      tauri.getTaskOutputCount(taskId),
    ])
      .then(([existingOutput, count]) => {
        setOutput(existingOutput);
        setTotalCount(count);
        setLoadedCount(existingOutput.length);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [taskId]);

  // Listen for new output with batching
  useEffect(() => {
    if (!taskId) return;

    const unlisten = listen<OutputEvent>("task-output", (event) => {
      if (event.payload.task_id === taskId) {
        // Add to pending buffer instead of updating state immediately
        pendingOutputRef.current.push({
          output_type: event.payload.output_type,
          content: event.payload.content,
          timestamp: event.payload.timestamp,
        });

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
  }, [taskId, flushPendingOutput]);

  // Debounced auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (scrollTimeoutRef.current !== null) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = window.setTimeout(() => {
      if (outputRef.current) {
        outputRef.current.scrollTop = outputRef.current.scrollHeight;
      }
      scrollTimeoutRef.current = null;
    }, 100); // Debounce scroll by 100ms

    return () => {
      if (scrollTimeoutRef.current !== null) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [output]);

  // Load more output (older items)
  const loadMore = useCallback(async () => {
    if (!taskId || isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const moreOutput = await tauri.getTaskOutput(taskId, PAGE_SIZE, loadedCount);
      setOutput((prev) => prev.concat(moreOutput));
      setLoadedCount((prev) => prev + moreOutput.length);
    } catch (error) {
      console.error("Failed to load more output:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [taskId, isLoadingMore, hasMore, loadedCount]);

  const clearOutput = useCallback(() => {
    setOutput([]);
    setTotalCount(0);
    setLoadedCount(0);
    pendingOutputRef.current = [];
  }, []);

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
