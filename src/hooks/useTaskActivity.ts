import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ActivityEvent } from "../types/task";

const MAX_ACTIVITIES = 50;

export interface ActiveAgent {
  description: string;
  startedAt: string;
}

export function useTaskActivity(taskId: string | null) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [currentActivity, setCurrentActivity] = useState<ActivityEvent | null>(null);
  const [activeAgent, setActiveAgent] = useState<ActiveAgent | null>(null);

  // Track the Task tool_use ID so we can match it with tool_result
  const agentToolIdRef = useRef<string | null>(null);

  const clearActivities = useCallback(() => {
    setActivities([]);
    setCurrentActivity(null);
    setActiveAgent(null);
    agentToolIdRef.current = null;
  }, []);

  useEffect(() => {
    if (!taskId) {
      clearActivities();
      return;
    }

    // Clear activities when task changes
    clearActivities();

    const unlistenPromise = listen<ActivityEvent>("task-activity", (event) => {
      if (event.payload.task_id === taskId) {
        const activity = event.payload;

        if (activity.activity_type === "tool_use") {
          if (activity.tool_name === "Task") {
            // Sub-agent started — track it
            const desc = (activity.tool_input?.description as string) || "subtask";
            setActiveAgent({ description: desc, startedAt: activity.timestamp });
            // Store a marker to identify when agent is active (agents are sequential)
            agentToolIdRef.current = activity.timestamp;
          }
          setCurrentActivity(activity);
        } else if (activity.activity_type === "tool_result") {
          // If the result is for a Task tool, clear the active agent
          // Use ref instead of state (state would be stale in callback)
          if (agentToolIdRef.current !== null && activity.tool_name === "Task") {
            setActiveAgent(null);
            agentToolIdRef.current = null;
          }
          setCurrentActivity(null);
        }

        // Add to activities list (keep limited)
        setActivities((prev) => {
          const newActivities = [...prev, activity];
          if (newActivities.length > MAX_ACTIVITIES) {
            return newActivities.slice(-MAX_ACTIVITIES);
          }
          return newActivities;
        });
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, [taskId, clearActivities]);

  return { activities, currentActivity, activeAgent, clearActivities };
}
