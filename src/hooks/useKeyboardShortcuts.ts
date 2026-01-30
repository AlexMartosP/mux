import { useEffect, useCallback } from "react";

interface KeyboardShortcutsOptions {
  // Global actions
  onNewTask: () => void;
  onOpenSettings: () => void;
  onCloseModal: () => void;
  onFocusSearch: () => void;
  onToggleSidebar?: () => void;

  // Task navigation
  onPreviousTask: () => void;
  onNextTask: () => void;
  onSelectTaskByIndex: (index: number) => void;

  // Task actions (only when task is selected)
  selectedTaskId: string | null;
  onStopTask?: () => void;
  onRestartTask?: () => void;
  onCopyBranch?: () => void;
  onCreatePR?: () => void;

  // State
  isSettingsOpen: boolean;
  isInputFocused?: boolean;
}

export function useKeyboardShortcuts({
  onNewTask,
  onOpenSettings,
  onCloseModal,
  onFocusSearch,
  onToggleSidebar,
  onPreviousTask,
  onNextTask,
  onSelectTaskByIndex,
  selectedTaskId,
  onStopTask,
  onRestartTask,
  onCopyBranch,
  onCreatePR,
  isSettingsOpen,
}: KeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      const isShift = e.shiftKey;
      const target = e.target as HTMLElement;
      const isInputElement =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      // Escape - close modals/settings (always works)
      if (e.key === "Escape") {
        onCloseModal();
        return;
      }

      // Don't trigger shortcuts when typing in inputs (except Escape)
      if (isInputElement && !isMod) {
        return;
      }

      // Cmd+N - New task
      if (isMod && e.key === "n") {
        e.preventDefault();
        onNewTask();
        return;
      }

      // Cmd+, - Open settings
      if (isMod && e.key === ",") {
        e.preventDefault();
        onOpenSettings();
        return;
      }

      // Cmd+Shift+F - Focus search
      if (isMod && isShift && e.key.toLowerCase() === "f") {
        e.preventDefault();
        onFocusSearch();
        return;
      }

      // Cmd+B - Toggle sidebar
      if (isMod && e.key.toLowerCase() === "b") {
        e.preventDefault();
        onToggleSidebar?.();
        return;
      }

      // Don't trigger task-specific shortcuts in settings
      if (isSettingsOpen) {
        return;
      }

      // Cmd+↑ - Previous task
      if (isMod && e.key === "ArrowUp") {
        e.preventDefault();
        onPreviousTask();
        return;
      }

      // Cmd+↓ - Next task
      if (isMod && e.key === "ArrowDown") {
        e.preventDefault();
        onNextTask();
        return;
      }

      // Cmd+1-9 - Select task by position
      if (isMod && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const index = parseInt(e.key) - 1;
        onSelectTaskByIndex(index);
        return;
      }

      // Task-specific shortcuts (require selected task)
      if (!selectedTaskId) {
        return;
      }

      // Cmd+. - Stop task
      if (isMod && e.key === ".") {
        e.preventDefault();
        onStopTask?.();
        return;
      }

      // Cmd+R - Restart task (only if not in input)
      if (isMod && e.key === "r" && !isInputElement) {
        e.preventDefault();
        onRestartTask?.();
        return;
      }

      // Cmd+Shift+C - Copy branch name
      if (isMod && isShift && e.key.toLowerCase() === "c") {
        e.preventDefault();
        onCopyBranch?.();
        return;
      }

      // Cmd+P - Create PR
      if (isMod && e.key === "p") {
        e.preventDefault();
        onCreatePR?.();
        return;
      }
    },
    [
      onNewTask,
      onOpenSettings,
      onCloseModal,
      onFocusSearch,
      onToggleSidebar,
      onPreviousTask,
      onNextTask,
      onSelectTaskByIndex,
      selectedTaskId,
      onStopTask,
      onRestartTask,
      onCopyBranch,
      onCreatePR,
      isSettingsOpen,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}

// Helper to format shortcut for display
export function formatShortcut(shortcut: string): string {
  const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  return shortcut
    .replace("Cmd", isMac ? "⌘" : "Ctrl")
    .replace("Shift", isMac ? "⇧" : "Shift+")
    .replace("Alt", isMac ? "⌥" : "Alt+")
    .replace("+", "");
}

// Shortcut definitions for display
export const SHORTCUTS = {
  newTask: "Cmd+N",
  settings: "Cmd+,",
  focusSearch: "Cmd+Shift+F",
  toggleSidebar: "Cmd+B",
  closeModal: "Esc",
  previousTask: "Cmd+↑",
  nextTask: "Cmd+↓",
  selectTask: "Cmd+1-9",
  stopAgent: "Cmd+.",
  restartAgent: "Cmd+R",
  copyBranch: "Cmd+Shift+C",
  createPR: "Cmd+P",
} as const;
