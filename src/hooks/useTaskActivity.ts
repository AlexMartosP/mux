import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ActivityEvent } from "../types/task";

const MAX_ACTIVITIES = 50;

export function useTaskActivity(taskId: string | null) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [currentActivity, setCurrentActivity] = useState<ActivityEvent | null>(null);

  const clearActivities = useCallback(() => {
    setActivities([]);
    setCurrentActivity(null);
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

        // Update current activity for tool_use events
        if (activity.activity_type === "tool_use") {
          setCurrentActivity(activity);
        } else if (activity.activity_type === "tool_result") {
          // Clear current activity when result comes back
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

  return { activities, currentActivity, clearActivities };
}
