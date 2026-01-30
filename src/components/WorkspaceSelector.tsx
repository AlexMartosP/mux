import { useState, useRef, useEffect } from "react";
import { ChevronDown, Settings } from "lucide-react";
import type { Workspace } from "../types/agent";

interface WorkspaceSelectorProps {
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string | null) => void;
  onOpenSettings: () => void;
}

export function WorkspaceSelector({
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onOpenSettings,
}: WorkspaceSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId);
  const displayName = selectedWorkspace?.name || "All Agents";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs transition-colors"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          color: "var(--text-primary)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = "var(--border-active)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = "var(--border-default)";
        }}
      >
        <span className="truncate">{displayName}</span>
        <ChevronDown
          size={14}
          style={{
            color: "var(--text-dim)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        />
      </button>

      {isOpen && (
        <div
          className="absolute top-full left-0 right-0 mt-1 z-50 py-1 shadow-lg"
          style={{
            backgroundColor: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          {/* All Agents option */}
          <button
            onClick={() => {
              onSelectWorkspace(null);
              setIsOpen(false);
            }}
            className="w-full text-left px-3 py-1.5 text-xs transition-colors"
            style={{
              backgroundColor:
                selectedWorkspaceId === null ? "var(--bg-accent-subtle)" : "transparent",
              color: "var(--text-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor =
                selectedWorkspaceId === null ? "var(--bg-accent-subtle)" : "transparent";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            All Agents
          </button>

          {workspaces.length > 0 && (
            <div
              className="my-1"
              style={{
                height: "1px",
                backgroundColor: "var(--border-default)",
              }}
            />
          )}

          {/* Workspace list */}
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              onClick={() => {
                onSelectWorkspace(workspace.id);
                setIsOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs transition-colors"
              style={{
                backgroundColor:
                  selectedWorkspaceId === workspace.id
                    ? "var(--bg-accent-subtle)"
                    : "transparent",
                color: "var(--text-secondary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor =
                  selectedWorkspaceId === workspace.id
                    ? "var(--bg-accent-subtle)"
                    : "transparent";
                e.currentTarget.style.color = "var(--text-secondary)";
              }}
            >
              <div className="flex items-center gap-2">
                <span className="truncate flex-1">{workspace.name}</span>
                {workspace.is_default && (
                  <span
                    className="text-[10px] px-1"
                    style={{
                      backgroundColor: "var(--bg-surface)",
                      color: "var(--text-dim)",
                    }}
                  >
                    default
                  </span>
                )}
              </div>
            </button>
          ))}

          <div
            className="my-1"
            style={{
              height: "1px",
              backgroundColor: "var(--border-default)",
            }}
          />

          {/* Settings button */}
          <button
            onClick={() => {
              onOpenSettings();
              setIsOpen(false);
            }}
            className="w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2"
            style={{ color: "var(--text-dim)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-hover)";
              e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--text-dim)";
            }}
          >
            <Settings size={12} />
            <span>Manage Workspaces</span>
          </button>
        </div>
      )}
    </div>
  );
}
