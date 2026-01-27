import { useState, useEffect, useCallback } from "react";
import type { PermissionRequest } from "../lib/tauri";
import * as tauri from "../lib/tauri";

interface PermissionPopoverProps {
  request: PermissionRequest;
  onDismiss: () => void;
}

export function PermissionPopover({ request, onDismiss }: PermissionPopoverProps) {
  const [isResponding, setIsResponding] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Reset state when request changes (new request comes in)
  useEffect(() => {
    setIsResponding(false);
    setExpanded(false);
  }, [request.request_id]);

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
        return "var(--accent-magenta)";
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
      className="p-4"
      style={{
        backgroundColor: "var(--bg-elevated)",
        borderTop: `2px solid ${getToolColor()}`,
      }}
    >
      <div className="flex items-start gap-3">
        {/* Icon */}
        <span
          className="text-sm font-bold flex-shrink-0"
          style={{ color: getToolColor() }}
        >
          [?]
        </span>

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
          <button
            onClick={handleAllow}
            disabled={isResponding}
            className="px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "var(--accent-green)",
              color: "var(--bg-primary)",
            }}
          >
            {isResponding ? "..." : "ALLOW"}
          </button>
          <button
            onClick={handleDeny}
            disabled={isResponding}
            className="px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
            style={{
              backgroundColor: "transparent",
              border: "1px solid var(--accent-red)",
              color: "var(--accent-red)",
            }}
          >
            {isResponding ? "..." : "DENY"}
          </button>
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
