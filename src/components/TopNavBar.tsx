import { Settings } from "lucide-react";
import { Button } from "./Button";
import { WorkspaceSelector } from "./WorkspaceSelector";
import type { Workspace } from "../types/agent";
import Logo from "../assets/logo.svg?react";

type AppMode = "agents" | "prs" | "dashboard";

interface TopNavBarProps {
  currentMode: AppMode;
  onModeChange: (mode: AppMode) => void;
  workspaces: Workspace[];
  selectedWorkspaceId: string | null;
  onSelectWorkspace: (workspaceId: string | null) => void;
  onOpenSettings: () => void;
  agentCount?: number;
  prCount?: number;
}

const MODE_TABS: { id: AppMode; label: string; disabled: boolean }[] = [
  { id: "agents", label: "Agents", disabled: false },
  { id: "prs", label: "PRs", disabled: true },
  { id: "dashboard", label: "Dashboard", disabled: true },
];

export function TopNavBar({
  currentMode,
  onModeChange,
  workspaces,
  selectedWorkspaceId,
  onSelectWorkspace,
  onOpenSettings,
  agentCount,
  prCount,
}: TopNavBarProps) {
  return (
    <header
      className="flex items-center justify-between px-4"
      style={{
        height: "48px",
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-default)",
      }}
    >
      {/* Left: Logo and mode tabs */}
      <div className="flex items-center gap-6">
        <Logo className="h-5 w-auto" />

        {/* Mode tabs */}
        <nav className="flex items-center gap-1">
          {MODE_TABS.map((tab) => {
            const isActive = currentMode === tab.id;
            const count = tab.id === "agents" ? agentCount : tab.id === "prs" ? prCount : undefined;

            return (
              <button
                key={tab.id}
                onClick={() => !tab.disabled && onModeChange(tab.id)}
                disabled={tab.disabled}
                className="relative px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: isActive ? "var(--bg-accent-subtle)" : "transparent",
                  color: tab.disabled
                    ? "var(--text-dim)"
                    : isActive
                    ? "var(--accent-cyan)"
                    : "var(--text-secondary)",
                  borderRadius: "var(--border-radius)",
                  cursor: tab.disabled ? "not-allowed" : "pointer",
                  opacity: tab.disabled ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!tab.disabled && !isActive) {
                    e.currentTarget.style.backgroundColor = "var(--bg-hover)";
                    e.currentTarget.style.color = "var(--text-primary)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!tab.disabled && !isActive) {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }
                }}
              >
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span
                    className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: isActive
                        ? "var(--accent-cyan)"
                        : "var(--bg-surface)",
                      color: isActive
                        ? "var(--bg-primary)"
                        : "var(--text-dim)",
                      borderRadius: "999px",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Right: Workspace selector and settings */}
      <div className="flex items-center gap-3">
        {workspaces.length > 0 && (
          <div className="w-[180px]">
            <WorkspaceSelector
              workspaces={workspaces}
              selectedWorkspaceId={selectedWorkspaceId}
              onSelectWorkspace={onSelectWorkspace}
              onOpenSettings={onOpenSettings}
            />
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          title="Settings (Cmd+,)"
        >
          <Settings size={16} strokeWidth={1.5} />
        </Button>
      </div>
    </header>
  );
}
