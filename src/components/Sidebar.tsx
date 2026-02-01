import { useState, useMemo, useRef, useEffect, RefObject, memo } from "react";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { Bell, Settings, Pencil, Plus, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import type { Agent, CIStatus } from "../types/agent";
import { AgentList } from "./AgentList";
import { PermissionsQueue } from "./PermissionsQueue";
import { Button } from "@/components/ui/button";
import { usePermissions } from "../hooks/usePermissions";
import { formatShortcut, SHORTCUTS } from "../hooks/useKeyboardShortcuts";
import { useNotifications } from "../hooks/useNotifications";

interface SidebarProps {
  agents: Agent[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
  onNewAgent: () => void;
  onOpenSettings: () => void;
  onArchiveAgents: (agentIds: string[]) => Promise<void>;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  ciStatuses?: Map<string, CIStatus>;
}

export const Sidebar = memo(function Sidebar({
  agents,
  selectedAgentId,
  onSelectAgent,
  onNewAgent,
  onOpenSettings,
  onArchiveAgents,
  searchInputRef,
  collapsed = false,
  onToggleCollapse,
  ciStatuses,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  // Debounce search to prevent filtering on every keystroke
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 150);
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set());
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<Set<string>>(new Set());
  const [isArchiving, setIsArchiving] = useState(false);

  // Get all pending permissions to show indicators on agents
  const { pendingAgentIds } = usePermissions();

  // Get notifications for badge count
  const { unreadCount } = useNotifications();

  // Get unique repos from agents
  const repos = useMemo(() => {
    const repoSet = new Set<string>();
    agents.forEach(agent => {
      const repoName = agent.repository_path.split('/').pop() || agent.repository_path;
      repoSet.add(repoName);
    });
    return Array.from(repoSet).sort();
  }, [agents]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredAgents = useMemo(() => {
    let result = agents;

    // Filter by search query (using debounced value for performance)
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter(agent =>
        agent.name.toLowerCase().includes(query) ||
        agent.description?.toLowerCase().includes(query) ||
        agent.prompt.toLowerCase().includes(query) ||
        agent.branch.toLowerCase().includes(query)
      );
    }

    // Filter by repository
    if (selectedRepos.size > 0) {
      result = result.filter(agent => {
        const repoName = agent.repository_path.split('/').pop() || agent.repository_path;
        return selectedRepos.has(repoName);
      });
    }

    return result;
  }, [agents, debouncedSearchQuery, selectedRepos]);

  const toggleRepo = (repo: string) => {
    setSelectedRepos(prev => {
      const next = new Set(prev);
      if (next.has(repo)) {
        next.delete(repo);
      } else {
        next.add(repo);
      }
      return next;
    });
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedRepos(new Set());
  };

  const hasActiveFilters = searchQuery.trim() || selectedRepos.size > 0;

  const toggleAgentSelection = (agentId: string) => {
    setSelectedAgentIds(prev => {
      const next = new Set(prev);
      if (next.has(agentId)) {
        next.delete(agentId);
      } else {
        next.add(agentId);
      }
      return next;
    });
  };

  const selectAllAgents = () => {
    setSelectedAgentIds(new Set(filteredAgents.map(a => a.id)));
  };

  const clearSelection = () => {
    setSelectedAgentIds(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedAgentIds(new Set());
  };

  const handleArchiveSelected = async () => {
    if (selectedAgentIds.size === 0) return;
    const confirmed = window.confirm(
      `Archive ${selectedAgentIds.size} agent${selectedAgentIds.size > 1 ? 's' : ''}?\n\nThis will remove the associated worktrees and cannot be undone.`
    );
    if (!confirmed) return;

    setIsArchiving(true);
    try {
      await onArchiveAgents(Array.from(selectedAgentIds));
      exitSelectMode();
    } finally {
      setIsArchiving(false);
    }
  };

  const handleArchiveAll = async () => {
    if (filteredAgents.length === 0) return;
    const confirmed = window.confirm(
      `Archive all ${filteredAgents.length} agent${filteredAgents.length > 1 ? 's' : ''}${selectedRepos.size > 0 ? ' in selected repos' : ''}?\n\nThis will remove the associated worktrees and cannot be undone.`
    );
    if (!confirmed) return;

    setIsArchiving(true);
    try {
      await onArchiveAgents(filteredAgents.map(a => a.id));
      exitSelectMode();
    } finally {
      setIsArchiving(false);
    }
  };

  // Collapsed sidebar view
  if (collapsed) {
    return (
      <aside
        className="w-[52px] h-screen flex flex-col transition-all duration-200"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-default)'
        }}
      >
        {/* Expand button */}
        <div className="p-2 flex justify-center" style={{ borderBottom: '1px solid var(--border-default)' }}>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            title={`Expand sidebar (${formatShortcut(SHORTCUTS.toggleSidebar)})`}
          >
            <ChevronsRight size={16} strokeWidth={1.5} />
          </Button>
        </div>

        {/* New agent button */}
        <div className="p-2 flex justify-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={onNewAgent}
            title={`New agent (${formatShortcut(SHORTCUTS.newTask)})`}
          >
            <Plus size={16} strokeWidth={1.5} />
          </Button>
        </div>

        {/* Agent status indicators */}
        <div className="flex-1 overflow-y-auto py-1">
          {filteredAgents.map((agent) => {
            const isSelected = agent.id === selectedAgentId;
            const hasPendingPermission = pendingAgentIds.has(agent.id);
            const statusColor = (() => {
              if (hasPendingPermission) return 'var(--accent-yellow)';
              switch (agent.status) {
                case 'running': return 'var(--accent-green)';
                case 'waiting_input': return 'var(--accent-yellow)';
                case 'completed': return 'var(--text-secondary)';
                case 'error': return 'var(--accent-red)';
                case 'manual_control': return 'var(--accent-cyan)';
                case 'queued': return 'var(--accent-cyan)';
                default: return 'var(--text-dim)';
              }
            })();

            return (
              <button
                key={agent.id}
                onClick={() => onSelectAgent(agent.id)}
                className="w-full p-2 flex justify-center transition-colors"
                style={{
                  backgroundColor: isSelected ? 'var(--bg-accent-subtle)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                }}
                title={agent.name}
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: statusColor }}
                />
              </button>
            );
          })}
        </div>

        {/* Footer icons */}
        <div className="p-2 flex justify-center gap-1" style={{ borderTop: '1px solid var(--border-default)' }}>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSettings}
            title={`Settings (${formatShortcut(SHORTCUTS.settings)})`}
          >
            <Settings size={16} strokeWidth={1.5} />
          </Button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[280px] h-screen flex flex-col transition-all duration-200" style={{
      backgroundColor: 'var(--bg-surface)',
      borderRight: '1px solid var(--border-default)'
    }}>
      {/* Header */}
      <div className="p-3 flex items-center justify-end" style={{ borderBottom: '1px solid var(--border-default)' }}>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          title={`Collapse sidebar (${formatShortcut(SHORTCUTS.toggleSidebar)})`}
        >
          <ChevronsLeft size={16} strokeWidth={1.5} />
        </Button>
      </div>

      {/* Controls */}
      <div className="p-3 space-y-2">
        {/* New Agent Button */}
        <Button
          variant="ghost"
          onClick={onNewAgent}
          className="w-full justify-start gap-2"
          title={`Spawn agent (${formatShortcut(SHORTCUTS.newTask)})`}
        >
          <Plus size={14} strokeWidth={1.5} className="text-primary" />
          Spawn agent
        </Button>

        {/* Search Input */}
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search... (${formatShortcut(SHORTCUTS.focusSearch)})`}
            className="w-full px-3 py-2 text-xs"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: `1px solid ${searchQuery ? 'var(--accent-cyan)' : 'var(--border-default)'}`,
              borderRadius: '4px',
              color: 'var(--text-primary)',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 transition-colors"
              style={{ color: 'var(--text-dim)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
            >
              <X size={14} strokeWidth={1} />
            </button>
          )}
        </div>

        {/* Repo Filter Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="w-full px-3 py-2 text-xs text-left flex items-center justify-between"
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: `1px solid ${selectedRepos.size > 0 ? 'var(--accent-cyan)' : 'var(--border-default)'}`,
              borderRadius: '4px',
              color: selectedRepos.size > 0 ? 'var(--text-primary)' : 'var(--text-dim)',
            }}
          >
            <span className="truncate">
              {selectedRepos.size === 0
                ? 'All repositories'
                : selectedRepos.size === 1
                  ? Array.from(selectedRepos)[0]
                  : `${selectedRepos.size} repos selected`}
            </span>
            <span style={{ color: 'var(--text-dim)' }}>{dropdownOpen ? '▲' : '▼'}</span>
          </button>

          {dropdownOpen && (
            <div
              className="absolute top-full left-0 right-0 mt-1 max-h-48 overflow-y-auto z-50"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-active)',
                borderRadius: '4px',
              }}
            >
              {repos.map(repo => (
                <label
                  key={repo}
                  className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-surface)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <input
                    type="checkbox"
                    checked={selectedRepos.has(repo)}
                    onChange={() => toggleRepo(repo)}
                    className="accent-cyan-400"
                  />
                  <span className="truncate">{repo}</span>
                </label>
              ))}
              {repos.length === 0 && (
                <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                  No repositories
                </div>
              )}
            </div>
          )}
        </div>

        {/* Clear all filters button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
           
            onClick={clearAllFilters}
            className="w-full"
          >
            Clear filters
          </Button>
        )}
      </div>

      {/* Agent count */}
      {hasActiveFilters && (
        <div
          className="px-3 pb-2 text-xs"
          style={{ color: 'var(--text-dim)' }}
        >
          {filteredAgents.length} of {agents.length} agents
        </div>
      )}

      {/* Select mode action bar */}
      {selectMode && (
        <div
          className="px-3 py-2 flex items-center gap-2 flex-wrap"
          style={{ borderBottom: '1px solid var(--border-default)', backgroundColor: 'var(--bg-elevated)' }}
        >
          <button
            onClick={selectAllAgents}
            className="text-xs transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            Select All
          </button>
          <span style={{ color: 'var(--text-dim)' }}>|</span>
          <button
            onClick={clearSelection}
            className="text-xs transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            Clear
          </button>
          <span style={{ color: 'var(--text-dim)' }}>|</span>
          <button
            onClick={exitSelectMode}
            className="text-xs transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-secondary)'}
          >
            Cancel
          </button>
          <div className="flex-1" />
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>
            {selectedAgentIds.size} selected
          </span>
        </div>
      )}

      {/* Agent List */}
      <div className="flex-1 overflow-y-auto">
        <AgentList
          agents={filteredAgents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
          pendingPermissionAgentIds={pendingAgentIds}
          onArchiveAgent={async (agentId) => {
            const agent = agents.find(a => a.id === agentId);
            const confirmed = window.confirm(
              `Archive "${agent?.name || 'this agent'}"?\n\nThis will remove the associated worktree and cannot be undone.`
            );
            if (confirmed) {
              await onArchiveAgents([agentId]);
            }
          }}
          selectMode={selectMode}
          selectedAgentIds={selectedAgentIds}
          onToggleAgentSelection={toggleAgentSelection}
          ciStatuses={ciStatuses}
        />
      </div>

      {/* Bulk action buttons when in select mode */}
      {selectMode && (
        <div
          className="p-3 space-y-2"
          style={{ borderTop: '1px solid var(--border-default)' }}
        >
          <Button
            variant="outline"
           
            onClick={handleArchiveSelected}
            disabled={selectedAgentIds.size === 0 || isArchiving}
            className="w-full"
          >
            {isArchiving ? 'Archiving...' : `Archive selected (${selectedAgentIds.size})`}
          </Button>
          <Button
            variant="ghost"
            onClick={handleArchiveAll}
            disabled={filteredAgents.length === 0 || isArchiving}
            className="w-full"
          >
            Archive all ({filteredAgents.length})
          </Button>
        </div>
      )}

      {/* Footer: compact icon buttons */}
      <div
        className="px-3 py-2 flex items-center justify-center gap-2"
        style={{ borderTop: '1px solid var(--border-default)' }}
      >
        {/* Permissions Queue */}
        <PermissionsQueue
          agents={agents}
          onNavigateToAgent={onSelectAgent}
        />

        {/* Notifications */}
        <Button variant="ghost" size="icon" title="Notifications" className="relative">
          <Bell size={16} strokeWidth={1.5} />
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-medium"
              style={{
                backgroundColor: 'var(--accent-red)',
                color: 'var(--bg-primary)',
                borderRadius: '8px',
              }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>

        {/* Edit/Select mode */}
        {agents.length > 0 && (
          <Button
            variant={selectMode ? "default" : "ghost"}
            size="icon"
            onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
            title={selectMode ? "Exit edit mode" : "Edit agents"}
          >
            <Pencil size={16} strokeWidth={1.5} />
          </Button>
        )}

        {/* Settings */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenSettings}
          title={`Settings (${formatShortcut(SHORTCUTS.settings)})`}
        >
          <Settings size={16} strokeWidth={1.5} />
        </Button>
      </div>
    </aside>
  );
});
