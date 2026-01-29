import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import * as tauri from "../lib/tauri";

export function useNotifications() {
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = async () => {
    try {
      const count = await tauri.getUnreadNotificationCount();
      setUnreadCount(count);
    } catch (err) {
      console.error("Failed to load unread count:", err);
    }
  };

  useEffect(() => {
    loadUnreadCount();

    const unlisten = listen("task-notification", () => {
      loadUnreadCount();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return { unreadCount, refresh: loadUnreadCount };
}
