import { useState, useEffect, useCallback } from "react";
import type { PermissionRequest } from "../lib/tauri";
import * as tauri from "../lib/tauri";
import { Button } from "./Button";

interface PermissionDialogProps {
  request: PermissionRequest;
  onDismiss: () => void;
}

export function PermissionDialog({ request, onDismiss }: PermissionDialogProps) {
  const [isResponding, setIsResponding] = useState(false);

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
      if (e.key === "Enter") {
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
        return `Run command: ${truncate(String(request.tool_input.command || ""), 100)}`;
      case "Write":
        return `Write to file: ${request.tool_input.file_path}`;
      case "Edit":
        return `Edit file: ${request.tool_input.file_path}`;
      case "Read":
        return `Read file: ${request.tool_input.file_path}`;
      default:
        return `Use tool: ${request.tool_name}`;
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
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.8)" }}
    >
      <div
        className="max-w-lg w-full mx-4 p-6"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: `1px solid ${getToolColor()}`,
          borderRadius: "var(--border-radius)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <span
            className="text-lg font-bold"
            style={{ color: getToolColor() }}
          >
            [?]
          </span>
          <h2
            className="text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            PERMISSION REQUEST
          </h2>
        </div>

        {/* Tool info */}
        <div className="mb-4">
          <div
            className="text-xs mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Claude wants to:
          </div>
          <div
            className="p-3"
            style={{
              backgroundColor: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--border-radius)",
            }}
          >
            <div
              className="text-xs font-medium mb-1"
              style={{ color: getToolColor() }}
            >
              {request.tool_name}
            </div>
            <div
              className="text-xs"
              style={{ color: "var(--text-primary)" }}
            >
              {getToolDescription()}
            </div>
          </div>
        </div>

        {/* Tool input details */}
        {request.tool_input && Object.keys(request.tool_input).length > 0 && (
          <div className="mb-4">
            <div
              className="text-xs mb-2"
              style={{ color: "var(--text-secondary)" }}
            >
              Details:
            </div>
            <pre
              className="p-3 text-xs overflow-x-auto max-h-32 overflow-y-auto"
              style={{
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: "var(--border-radius)",
                color: "var(--text-dim)",
              }}
            >
              {JSON.stringify(request.tool_input, null, 2)}
            </pre>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="primary"
            color="green"
            onClick={handleAllow}
            disabled={isResponding}
            className="flex-1"
          >
            {isResponding ? "..." : "Allow"}
          </Button>
          <Button
            variant="secondary"
            color="red"
            onClick={handleDeny}
            disabled={isResponding}
            className="flex-1"
          >
            {isResponding ? "..." : "Deny"}
          </Button>
        </div>

        {/* Keyboard hints */}
        <div
          className="mt-4 text-xs text-center"
          style={{ color: "var(--text-dim)" }}
        >
          Press <span style={{ color: "var(--text-secondary)" }}>Enter</span> to allow,{" "}
          <span style={{ color: "var(--text-secondary)" }}>Esc</span> to deny
        </div>
      </div>
    </div>
  );
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}
