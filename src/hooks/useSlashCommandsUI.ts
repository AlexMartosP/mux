import { useState, useMemo, useCallback, useRef } from "react";
import type { SlashCommand } from "../lib/tauri";

interface UseSlashCommandsUIOptions {
  /** Called when a command is selected */
  onSelect: (command: string) => void;
  /** The current input value to filter commands */
  inputValue: string;
}

interface UseSlashCommandsUIReturn {
  /** Whether the dropdown is visible */
  isOpen: boolean;
  /** Set dropdown visibility */
  setIsOpen: (open: boolean) => void;
  /** Currently selected command index */
  selectedIndex: number;
  /** Filtered commands based on input */
  filteredCommands: SlashCommand[];
  /** Ref for the dropdown container (for scroll into view) */
  dropdownRef: React.RefObject<HTMLDivElement | null>;
  /** Handle input change - updates visibility and resets selection */
  handleInputChange: (value: string) => void;
  /** Handle hover on command item */
  handleHover: (index: number) => void;
  /** Handle selecting a command */
  handleSelect: (command: string) => void;
  /** Handle keyboard navigation - returns true if event was handled */
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
}

/**
 * Hook for managing slash command dropdown UI state and interactions.
 * Handles filtering, keyboard navigation, and selection.
 */
export function useSlashCommandsUI(
  commands: SlashCommand[],
  options: UseSlashCommandsUIOptions
): UseSlashCommandsUIReturn {
  const { onSelect, inputValue } = options;
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filter commands based on input
  const filteredCommands = useMemo(() => {
    if (!inputValue.startsWith("/")) return [];
    const query = inputValue.toLowerCase();
    return commands.filter((cmd) =>
      cmd.command.toLowerCase().startsWith(query)
    );
  }, [inputValue, commands]);

  // Handle input change
  const handleInputChange = useCallback((value: string) => {
    setIsOpen(value.startsWith("/") && value.length > 0);
    setSelectedIndex(0);
  }, []);

  // Handle hover on command item
  const handleHover = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  // Handle selecting a command
  const handleSelect = useCallback((command: string) => {
    onSelect(command);
    setIsOpen(false);
    setSelectedIndex(0);
  }, [onSelect]);

  // Scroll selected item into view
  const scrollSelectedIntoView = useCallback((index: number) => {
    const container = dropdownRef.current;
    const item = container?.querySelector(`[data-index="${index}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent): boolean => {
    if (!isOpen || filteredCommands.length === 0) return false;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const newIndex = selectedIndex < filteredCommands.length - 1
        ? selectedIndex + 1
        : 0;
      setSelectedIndex(newIndex);
      scrollSelectedIntoView(newIndex);
      return true;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      const newIndex = selectedIndex > 0
        ? selectedIndex - 1
        : filteredCommands.length - 1;
      setSelectedIndex(newIndex);
      scrollSelectedIntoView(newIndex);
      return true;
    }

    if (e.key === "Tab") {
      e.preventDefault();
      handleSelect(filteredCommands[selectedIndex].command);
      return true;
    }

    if (e.key === "Escape") {
      setIsOpen(false);
      return true;
    }

    return false;
  }, [isOpen, filteredCommands, selectedIndex, handleSelect, scrollSelectedIntoView]);

  return {
    isOpen,
    setIsOpen,
    selectedIndex,
    filteredCommands,
    dropdownRef,
    handleInputChange,
    handleHover,
    handleSelect,
    handleKeyDown,
  };
}
