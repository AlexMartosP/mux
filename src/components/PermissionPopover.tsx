import { useState, useEffect, useCallback, useRef } from "react";
import type { PermissionRequest } from "../lib/tauri";
import * as tauri from "../lib/tauri";
import { Button } from "./Button";

interface PermissionPopoverProps {
  request: PermissionRequest;
  onDismiss: () => void;
}

export function PermissionPopover({ request, onDismiss }: PermissionPopoverProps) {
  const [isResponding, setIsResponding] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showAlwaysMenu, setShowAlwaysMenu] = useState(false);
  const alwaysMenuRef = useRef<HTMLDivElement>(null);

  // Reset state when request changes (new request comes in)
  useEffect(() => {
    setIsResponding(false);
    setExpanded(false);
    setShowAlwaysMenu(false);
  }, [request.request_id]);

  // Close always menu on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (alwaysMenuRef.current && !alwaysMenuRef.current.contains(e.target as Node)) {
        setShowAlwaysMenu(false);
      }
    };
    if (showAlwaysMenu) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showAlwaysMenu]);

  const handleAllow = useCallback(async () => {
    if (isResponding) return;
    setIsResponding(true);
    await tauri.respondPermission(request.request_id, "allow");
    onDismiss();
  }, [isResponding, request.request_id, onDismiss]);

  const handleDeny = useCallback(async () => {
    if (isResponding) return;
    setIsResponding(true);
    await tauri.respondPermission(request.request_id, "deny");
    onDismiss();
  }, [isResponding, request.request_id, onDismiss]);

  const handleAlwaysAllow = useCallback(async (scope: "global" | "project") => {
    if (isResponding) return;
    setIsResponding(true);
    setShowAlwaysMenu(false);
    try {
      // Add the permission rule to Claude settings
      await tauri.addPermissionRule(
        request.task_id,
        request.tool_name,
        request.tool_input,
        scope
      );
      // Then allow this request
      await tauri.respondPermission(request.request_id, "allow");
    } catch (err) {
      console.error("Failed to add permission rule:", err);
      // Still allow the current request even if saving failed
      await tauri.respondPermission(request.request_id, "allow");
    }
    onDismiss();
  }, [isResponding, request, onDismiss]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handleAllow();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleDeny();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleAllow, handleDeny]);

  const getToolDescription = () => {
    switch (request.tool_name) {
      case "Bash":
        return truncate(String(request.tool_input.command || ""), 80);
      case "Write":
        return `Write: ${request.tool_input.file_path}`;
      case "Edit":
        return `Edit: ${request.tool_input.file_path}`;
      case "Read":
        return `Read: ${request.tool_input.file_path}`;
      default:
        return `${request.tool_name}`;
    }
  };

  const getToolColor = () => {
    switch (request.tool_name) {
      case "Bash":
        return "var(--accent-cyan)";
      case "Write":
      case "Edit":
        return "var(--accent-green)";
      case "Read":
        return "var(--accent-cyan)";
      default:
        return "var(--accent-yellow)";
    }
  };

  return (
    <div
      className="w-full p-3"
      style={{
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--border-radius)",
      }}
    >
      <div className="flex items-start gap-3">
        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-medium"
              style={{ color: getToolColor() }}
            >
              {request.tool_name}
            </span>
            <span className="text-xs" style={{ color: "var(--text-dim)" }}>
              permission requested
            </span>
          </div>

          <div
            className="text-xs truncate"
            style={{ color: "var(--text-primary)" }}
            title={getToolDescription()}
          >
            {getToolDescription()}
          </div>

          {/* Expandable details */}
          {request.tool_input && Object.keys(request.tool_input).length > 0 && (
            <div className="mt-2">
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs"
                style={{ color: "var(--text-dim)" }}
              >
                {expanded ? "▼ Hide details" : "▶ Show details"}
              </button>
              {expanded && (
                <pre
                  className="mt-2 p-2 text-xs overflow-x-auto max-h-24 overflow-y-auto"
                  style={{
                    backgroundColor: "var(--bg-surface)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--border-radius)",
                    color: "var(--text-dim)",
                  }}
                >
                  {JSON.stringify(request.tool_input, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 flex-shrink-0">
          <Button
            variant="primary"
            color="green"
            onClick={handleAllow}
            disabled={isResponding}
          >
            {isResponding ? "..." : "Allow"}
          </Button>

          {/* Always Allow dropdown */}
          <div className="relative" ref={alwaysMenuRef}>
            <Button
              variant="secondary"
              onClick={() => setShowAlwaysMenu(!showAlwaysMenu)}
              disabled={isResponding}
              title="Always allow this type of action"
            >
              {isResponding ? "..." : "Always ▼"}
            </Button>
            {showAlwaysMenu && (
              <div
                className="absolute bottom-full right-0 mb-1 min-w-[140px] z-50"
                style={{
                  backgroundColor: "var(--bg-elevated)",
                  border: "1px solid var(--border-active)",
                  borderRadius: "var(--border-radius)",
                }}
              >
                <button
                  onClick={() => handleAlwaysAllow("project")}
                  className="w-full px-3 py-2 text-xs text-left transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-surface)"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  This project
                </button>
                <button
                  onClick={() => handleAlwaysAllow("global")}
                  className="w-full px-3 py-2 text-xs text-left transition-colors"
                  style={{ color: "var(--text-secondary)" }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--bg-surface)"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                >
                  All projects
                </button>
              </div>
            )}
          </div>

          <Button
            variant="secondary"
            color="red"
            onClick={handleDeny}
            disabled={isResponding}
          >
            {isResponding ? "..." : "Deny"}
          </Button>
        </div>
      </div>

      {/* Keyboard hints */}
      <div
        className="mt-2 text-xs"
        style={{ color: "var(--text-dim)" }}
      >
        <span style={{ color: "var(--text-secondary)" }}>Enter</span> allow •
        <span style={{ color: "var(--text-secondary)" }}> Esc</span> deny
      </div>
    </div>
  );
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}
