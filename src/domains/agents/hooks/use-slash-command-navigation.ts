import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSlashCommands } from "@/hooks/useSlashCommands";
import type { SlashCommand } from "@/domains/tauri/commands";

interface UseSlashCommandNavigationOptions {
  searchValue: string;
  repositoryPath?: string;
  onSelect: (command: string) => void;
}

interface UseSlashCommandNavigationReturn {
  /** Filtered commands based on search value */
  filteredCommands: SlashCommand[];
  /** Currently selected index */
  selectedIndex: number;
  /** Set selected index (for hover) */
  setSelectedIndex: (index: number) => void;
  /** Whether the dropdown should be visible */
  isOpen: boolean;
  /** Attach this to the textarea's onKeyDown */
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  /** Refresh commands from the server */
  refresh: () => void;
}

/**
 * Hook for slash command navigation.
 * Handles filtering, keyboard navigation, and selection.
 *
 * Usage:
 * ```tsx
 * const { filteredCommands, selectedIndex, isOpen, handleKeyDown, refresh } =
 *   useSlashCommandNavigation({
 *     searchValue: prompt,
 *     repositoryPath: agent.repository_path,
 *     onSelect: (cmd) => setPrompt(cmd + " "),
 *   });
 *
 * <textarea onKeyDown={(e) => {
 *   if (handleKeyDown(e)) return;
 *   // handle other keys...
 * }} />
 *
 * {isOpen && (
 *   <SlashCommandsDropdown
 *     commands={filteredCommands}
 *     selectedIndex={selectedIndex}
 *     onSelect={...}
 *   />
 * )}
 * ```
 */
export function useSlashCommandNavigation({
  searchValue,
  repositoryPath,
  onSelect,
}: UseSlashCommandNavigationOptions): UseSlashCommandNavigationReturn {
  const [dismissed, setDismissed] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const prevSearchRef = useRef(searchValue);

  // Fetch slash commands
  const { commands, refresh } = useSlashCommands(repositoryPath);

  // Filter commands based on search value
  const filteredCommands = useMemo(() => {
    if (!searchValue.startsWith("/")) return [];
    const query = searchValue.toLowerCase();
    return commands.filter((cmd) =>
      cmd.command.toLowerCase().startsWith(query)
    );
  }, [searchValue, commands]);

  // Determine if dropdown should show
  const isOpen = searchValue.startsWith("/") && filteredCommands.length > 0 && !dismissed;

  // Reset dismissed state when search changes
  useEffect(() => {
    if (searchValue !== prevSearchRef.current) {
      setDismissed(false);
      prevSearchRef.current = searchValue;
    }
  }, [searchValue]);

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredCommands.length]);

  // Keyboard handler - returns true if event was handled
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isOpen || filteredCommands.length === 0) return false;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % filteredCommands.length);
          return true;

        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
          return true;

        case "Tab":
        case "Enter":
          // Don't intercept Enter with modifiers
          if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
            return false;
          }
          e.preventDefault();
          onSelect(filteredCommands[selectedIndex].command);
          setDismissed(true);
          return true;

        case "Escape":
          e.preventDefault();
          setDismissed(true);
          return true;

        default:
          return false;
      }
    },
    [isOpen, filteredCommands, selectedIndex, onSelect]
  );

  return {
    filteredCommands,
    selectedIndex,
    setSelectedIndex,
    isOpen,
    handleKeyDown,
    refresh,
  };
}
