import { useState, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { Task, CreateTaskInput, StatusEvent, DescriptionEvent, TaskMetadataEvent } from "../types/task";
import * as tauri from "../lib/tauri";

export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;

  const loadTasks = useCallback(async () => {
    try {
      const loadedTasks = await tauri.getTasks();
      setTasks(loadedTasks);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Request notification permission on mount
  useEffect(() => {
    async function setupNotifications() {
      const granted = await isPermissionGranted();
      if (!granted) {
        await requestPermission();
      }
    }
    setupNotifications();
  }, []);

  // Listen for status changes
  useEffect(() => {
    const unlisten = listen<StatusEvent>("task-status", (event) => {
      const { task_id, status } = event.payload;

      setTasks((prev) =>
        prev.map((task) =>
          task.id === task_id ? { ...task, status: status as Task["status"] } : task
        )
      );
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for notifications
  useEffect(() => {
    const unlisten = listen<{ task_id: string; title: string; body: string; notification_type?: string }>(
      "task-notification",
      async (event) => {
        const { title, body, notification_type } = event.payload;

        // Check notification settings
        try {
          const settings = await tauri.getSettings();
          const isCompletion = notification_type === "completed" || title.includes("Completed");
          const isError = notification_type === "error" || title.includes("Failed") || title.includes("Error");

          // Skip notification if disabled in settings
          if (isCompletion && !settings.notify_on_completion) return;
          if (isError && !settings.notify_on_error) return;
        } catch {
          // If settings can't be fetched, show notification anyway
        }

        const granted = await isPermissionGranted();
        if (granted) {
          sendNotification({ title, body });
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for description updates
  useEffect(() => {
    const unlisten = listen<DescriptionEvent>("task-description", (event) => {
      const { task_id, description } = event.payload;

      setTasks((prev) =>
        prev.map((task) =>
          task.id === task_id ? { ...task, description } : task
        )
      );
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Listen for metadata updates (from background generation)
  useEffect(() => {
    const unlisten = listen<TaskMetadataEvent>("task-metadata", (event) => {
      const { task_id, name, description, branch, worktree_path } = event.payload;

      setTasks((prev) =>
        prev.map((task) =>
          task.id === task_id
            ? { ...task, name, description, branch, worktree_path, metadata_loading: false }
            : task
        )
      );
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const createTask = useCallback(async (input: CreateTaskInput) => {
    const newTask = await tauri.createTask(input);
    setTasks((prev) => [newTask, ...prev]);
    setSelectedTaskId(newTask.id);
    return newTask;
  }, []);

  const deleteTask = useCallback(
    async (id: string) => {
      await tauri.deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== id));
      if (selectedTaskId === id) {
        setSelectedTaskId(null);
      }
    },
    [selectedTaskId]
  );

  const stopTask = useCallback(
    async (id: string) => {
      await tauri.stopTask(id);
      // Status will be updated via event listener
    },
    []
  );

  const restartTask = useCallback(
    async (id: string, prompt?: string) => {
      await tauri.restartTask(id, prompt);
      // Status will be updated via event listener
    },
    []
  );

  const updateTask = useCallback((updatedTask: Task) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === updatedTask.id ? updatedTask : task
      )
    );
  }, []);

  return {
    tasks,
    selectedTask,
    selectedTaskId,
    isLoading,
    error,
    setSelectedTaskId,
    createTask,
    deleteTask,
    stopTask,
    restartTask,
    updateTask,
    refresh: loadTasks,
  };
}
