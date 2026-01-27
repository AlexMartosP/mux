import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { NotificationEntry } from "../types/task";
import * as tauri from "../lib/tauri";

interface NotificationCenterProps {
  onNavigateToTask?: (taskId: string) => void;
}

export function NotificationCenter({ onNavigateToTask }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadNotifications = async () => {
    try {
      const [notifs, count] = await Promise.all([
        tauri.getNotifications(50, true),
        tauri.getUnreadNotificationCount(),
      ]);
      setNotifications(notifs);
      setUnreadCount(count);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    }
  };

  useEffect(() => {
    loadNotifications();

    const unlisten = listen("task-notification", () => {
      loadNotifications();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleMarkAllRead = async () => {
    await tauri.markAllNotificationsRead();
    setUnreadCount(0);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const handleClear = async () => {
    await tauri.clearNotifications();
    setNotifications([]);
    setUnreadCount(0);
  };

  const handleClickNotification = async (notif: NotificationEntry) => {
    if (!notif.read) {
      await tauri.markNotificationRead(notif.id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    if (notif.task_id && onNavigateToTask) {
      onNavigateToTask(notif.task_id);
      setIsOpen(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return `${Math.floor(diffHr / 24)}d ago`;
  };

  const typeColor = (type: string) => {
    switch (type) {
      case "success": return "var(--accent-green)";
      case "error": return "var(--accent-red)";
      case "warning": return "var(--accent-yellow)";
      default: return "var(--text-secondary)";
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) loadNotifications();
        }}
        className="w-full px-4 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-2"
        style={{
          backgroundColor: "transparent",
          border: "1px solid var(--border-default)",
          color: "var(--text-dim)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--border-active)";
          e.currentTarget.style.color = "var(--text-secondary)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border-default)";
          e.currentTarget.style.color = "var(--text-dim)";
        }}
      >
        [!] NOTIFICATIONS
        {unreadCount > 0 && (
          <span
            className="text-xs font-bold px-1.5 py-0.5"
            style={{
              backgroundColor: "var(--accent-red)",
              color: "var(--bg-primary)",
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          className="absolute bottom-full left-0 right-0 mb-1 max-h-80 overflow-y-auto z-50"
          style={{
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--border-active)",
          }}
        >
          {/* Header */}
          <div
            className="px-3 py-2 flex items-center justify-between sticky top-0"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderBottom: "1px solid var(--border-default)",
            }}
          >
            <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              NOTIFICATIONS
            </span>
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-xs transition-colors"
                  style={{ color: "var(--text-dim)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-cyan)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
                >
                  Mark all read
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={handleClear}
                  className="text-xs transition-colors"
                  style={{ color: "var(--text-dim)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-red)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          {notifications.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs" style={{ color: "var(--text-dim)" }}>
              No notifications
            </div>
          ) : (
            notifications.map((notif) => (
              <button
                key={notif.id}
                onClick={() => handleClickNotification(notif)}
                className="w-full text-left px-3 py-2 transition-colors"
                style={{
                  backgroundColor: notif.read ? "transparent" : "var(--bg-surface)",
                  borderBottom: "1px solid var(--border-default)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-surface)")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = notif.read ? "transparent" : "var(--bg-surface)")
                }
              >
                <div className="flex items-center gap-2">
                  {!notif.read && (
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: "var(--accent-cyan)" }}
                    />
                  )}
                  <span className="text-xs font-medium flex-1" style={{ color: typeColor(notif.notification_type) }}>
                    {notif.title}
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                    {formatTime(notif.created_at)}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-dim)", paddingLeft: notif.read ? 0 : "14px" }}>
                  {notif.body}
                </p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
