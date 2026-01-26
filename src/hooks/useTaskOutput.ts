import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { OutputLine, OutputEvent } from "../types/task";
import * as tauri from "../lib/tauri";

export function useTaskOutput(taskId: string | null) {
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // Load existing output when task changes
  useEffect(() => {
    if (!taskId) {
      setOutput([]);
      return;
    }

    setIsLoading(true);
    tauri
      .getTaskOutput(taskId)
      .then((existingOutput) => {
        setOutput(existingOutput);
      })
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [taskId]);

  // Listen for new output
  useEffect(() => {
    if (!taskId) return;

    const unlisten = listen<OutputEvent>("task-output", (event) => {
      if (event.payload.task_id === taskId) {
        setOutput((prev) => [
          ...prev,
          {
            output_type: event.payload.output_type,
            content: event.payload.content,
            timestamp: event.payload.timestamp,
          },
        ]);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [taskId]);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const clearOutput = useCallback(() => {
    setOutput([]);
  }, []);

  return {
    output,
    isLoading,
    outputRef,
    clearOutput,
  };
}
