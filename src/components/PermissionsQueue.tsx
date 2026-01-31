import { useState, useEffect, useCallback, useRef } from "react";
import { X, ChevronDown, ChevronRight, Shield } from "lucide-react";
import type { PermissionRequest } from "../lib/tauri";
import type { Agent } from "../types/agent";
import * as tauri from "../lib/tauri";
import { Button } from "@/components/ui/button";
import { usePermissions } from "../hooks/usePermissions";

interface PermissionsQueueProps {
  agents: Agent[];
  onNavigateToAgent?: (agentId: string) => void;
}

// Get a description for the tool/action
function getToolDescription(request: PermissionRequest): string {
  switch (request.tool_name) {
    case "Bash":
      return truncate(String(request.tool_input.command || ""), 50);
    case "Write":
      return `Write: ${truncate(String(request.tool_input.file_path || ""), 35)}`;
    case "Edit":
      return `Edit: ${truncate(String(request.tool_input.file_path || ""), 35)}`;
    case "Read":
      return `Read: ${truncate(String(request.tool_input.file_path || ""), 35)}`;
    default:
      return `${request.tool_name}`;
  }
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}

function getToolColor(toolName: string): string {
  switch (toolName) {
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
}

// Check if a permission request is "safe" (read-only operations)
function isSafeOperation(request: PermissionRequest): boolean {
  return request.tool_name === "Read";
}

interface PermissionItemProps {
  request: PermissionRequest;
  agentName: string;
  onAllow: () => Promise<void>;
  onDeny: () => Promise<void>;
  onAlwaysAllow: (scope: "global" | "project") => Promise<void>;
  isResponding: boolean;
}

function PermissionItem({
  request,
  agentName,
  onAllow,
  onDeny,
  onAlwaysAllow,
  isResponding,
}: PermissionItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAlwaysMenu, setShowAlwaysMenu] = useState(false);
  const alwaysMenuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
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

  return (
    <div
      className="p-3"
      style={{
        borderBottom: "1px solid var(--border-default)",
      }}
    >
      {/* Agent name */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium" style={{ color: "var(--accent-cyan)" }}>
          {agentName}
        </span>
      </div>

      {/* Tool name and description */}
      <div className="flex items-start gap-2 mb-2">
        <span
          className="text-xs font-medium flex-shrink-0"
          style={{ color: getToolColor(request.tool_name) }}
        >
          {request.tool_name}:
        </span>
        <span
          className="text-xs break-all"
          style={{ color: "var(--text-primary)" }}
        >
          {getToolDescription(request)}
        </span>
      </div>

      {/* Expandable details */}
      {request.tool_input && Object.keys(request.tool_input).length > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-xs mb-2"
          style={{ color: "var(--text-dim)" }}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {expanded ? "Hide details" : "Show details"}
        </button>
      )}

      {expanded && (
        <pre
          className="mb-2 p-2 text-xs overflow-x-auto max-h-24 overflow-y-auto"
          style={{
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border-default)",
            borderRadius: "4px",
            color: "var(--text-dim)",
          }}
        >
          {JSON.stringify(request.tool_input, null, 2)}
        </pre>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          variant="default"
          size="sm"
          onClick={onAllow}
          disabled={isResponding}
        >
          {isResponding ? "..." : "Allow"}
        </Button>

        {/* Always Allow dropdown */}
        <div className="relative" ref={alwaysMenuRef}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAlwaysMenu(!showAlwaysMenu)}
            disabled={isResponding}
          >
            Always
          </Button>
          {showAlwaysMenu && (
            <div
              className="absolute top-full left-0 mt-1 min-w-[120px] z-50"
              style={{
                backgroundColor: "var(--bg-elevated)",
                border: "1px solid var(--border-active)",
                borderRadius: "4px",
              }}
            >
              <button
                onClick={() => {
                  setShowAlwaysMenu(false);
                  onAlwaysAllow("project");
                }}
                className="w-full px-3 py-2 text-xs text-left transition-colors"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-surface)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                This project
              </button>
              <button
                onClick={() => {
                  setShowAlwaysMenu(false);
                  onAlwaysAllow("global");
                }}
                className="w-full px-3 py-2 text-xs text-left transition-colors"
                style={{ color: "var(--text-secondary)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--bg-surface)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                All projects
              </button>
            </div>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onDeny}
          disabled={isResponding}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}

export function PermissionsQueue({ agents }: PermissionsQueueProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [respondingIds, setRespondingIds] = useState<Set<string>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);

  // Get all pending permissions
  const { totalPendingCount, allPendingRequests, dismissRequest } = usePermissions();

  // Get agent name by ID
  const getAgentName = useCallback(
    (agentId: string): string => {
      const agent = agents.find((a) => a.id === agentId);
      return agent?.name || "Unknown Agent";
    },
    [agents]
  );

  // Close panel on click outside
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

  // Keyboard shortcuts when panel is open
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Handle allow
  const handleAllow = useCallback(async (request: PermissionRequest) => {
    if (respondingIds.has(request.request_id)) return;
    setRespondingIds((prev) => new Set(prev).add(request.request_id));
    try {
      await tauri.respondPermission(request.request_id, "allow");
      dismissRequest(request.request_id);
    } catch (err) {
      console.error("Failed to allow permission:", err);
    } finally {
      setRespondingIds((prev) => {
        const next = new Set(prev);
        next.delete(request.request_id);
        return next;
      });
    }
  }, [respondingIds, dismissRequest]);

  // Handle deny
  const handleDeny = useCallback(async (request: PermissionRequest) => {
    if (respondingIds.has(request.request_id)) return;
    setRespondingIds((prev) => new Set(prev).add(request.request_id));
    try {
      await tauri.respondPermission(request.request_id, "deny");
      dismissRequest(request.request_id);
    } catch (err) {
      console.error("Failed to deny permission:", err);
    } finally {
      setRespondingIds((prev) => {
        const next = new Set(prev);
        next.delete(request.request_id);
        return next;
      });
    }
  }, [respondingIds, dismissRequest]);

  // Handle always allow
  const handleAlwaysAllow = useCallback(async (request: PermissionRequest, scope: "global" | "project") => {
    if (respondingIds.has(request.request_id)) return;
    setRespondingIds((prev) => new Set(prev).add(request.request_id));
    try {
      await tauri.addPermissionRule(
        request.agent_id,
        request.tool_name,
        request.tool_input,
        scope
      );
      await tauri.respondPermission(request.request_id, "allow");
      dismissRequest(request.request_id);
    } catch (err) {
      console.error("Failed to add permission rule:", err);
      // Still try to allow the current request
      try {
        await tauri.respondPermission(request.request_id, "allow");
        dismissRequest(request.request_id);
      } catch {
        // Ignore
      }
    } finally {
      setRespondingIds((prev) => {
        const next = new Set(prev);
        next.delete(request.request_id);
        return next;
      });
    }
  }, [respondingIds, dismissRequest]);

  // Allow all safe operations
  const handleAllowAllSafe = useCallback(async () => {
    const safeRequests = allPendingRequests.filter(isSafeOperation);
    for (const request of safeRequests) {
      await handleAllow(request);
    }
  }, [allPendingRequests, handleAllow]);

  // Don't render if no pending permissions
  if (totalPendingCount === 0) {
    return null;
  }

  const safeCount = allPendingRequests.filter(isSafeOperation).length;

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button */}
      <Button
        variant={isOpen ? "default" : "outline"}
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="gap-2"
      >
        <Shield size={14} />
        <span>{totalPendingCount}</span>
      </Button>

      {/* Queue panel */}
      {isOpen && (
        <div
          className="absolute bottom-full right-0 mb-2 w-[380px] max-h-[450px] overflow-hidden flex flex-col z-50"
          style={{
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--border-active)",
            borderRadius: "4px",
          }}
        >
          {/* Header */}
          <div
            className="px-4 py-3 flex items-center justify-between flex-shrink-0"
            style={{ borderBottom: "1px solid var(--border-default)" }}
          >
            <div className="flex items-center gap-2">
              <Shield size={16} style={{ color: "var(--accent-yellow)" }} />
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Pending Permissions
              </span>
              <span
                className="text-xs px-1.5 py-0.5"
                style={{
                  backgroundColor: "var(--accent-yellow)",
                  color: "var(--bg-primary)",
                  borderRadius: "4px",
                }}
              >
                {totalPendingCount}
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-1 transition-colors"
              style={{ color: "var(--text-dim)" }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
            >
              <X size={16} />
            </button>
          </div>

          {/* Bulk actions */}
          {safeCount > 0 && (
            <div
              className="px-4 py-2 flex items-center gap-2 flex-shrink-0"
              style={{
                borderBottom: "1px solid var(--border-default)",
                backgroundColor: "var(--bg-surface)",
              }}
            >
              <Button
                variant="outline"
                size="sm"
                onClick={handleAllowAllSafe}
                className="text-xs"
              >
                Allow All Safe ({safeCount})
              </Button>
              <span className="text-xs" style={{ color: "var(--text-dim)" }}>
                Read operations only
              </span>
            </div>
          )}

          {/* Permission list */}
          <div className="flex-1 overflow-y-auto">
            {allPendingRequests.map((request) => (
              <PermissionItem
                key={request.request_id}
                request={request}
                agentName={getAgentName(request.agent_id)}
                onAllow={() => handleAllow(request)}
                onDeny={() => handleDeny(request)}
                onAlwaysAllow={(scope) => handleAlwaysAllow(request, scope)}
                isResponding={respondingIds.has(request.request_id)}
              />
            ))}

            {allPendingRequests.length === 0 && (
              <div className="p-4 text-center">
                <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                  No pending permissions
                </p>
              </div>
            )}
          </div>

          {/* Footer hint */}
          <div
            className="px-4 py-2 flex-shrink-0"
            style={{
              borderTop: "1px solid var(--border-default)",
              backgroundColor: "var(--bg-surface)",
            }}
          >
            <p className="text-xs" style={{ color: "var(--text-dim)" }}>
              Press <span style={{ color: "var(--text-secondary)" }}>Esc</span> to close
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
