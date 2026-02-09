import { useRef } from "react";
import { Send, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { SlashCommandsDropdown } from "./slash-commands-dropdown";
import { useSlashCommandNavigation } from "../hooks/use-slash-command-navigation";
import { useAppSettings } from "@/domains/app/use-app-settings";

export function AgentChatInput({
  message,
  onChangeMessage,
  onSend,
  onStop,
  isAgentRunning = false,
  isSending = false,
  disabled = false,
  repositoryPath,
  placeholder,
  showAcceptEdits = false,
  acceptEdits = false,
  onAcceptEditsChange,
}: {
  message: string;
  onChangeMessage: (message: string) => void;
  onSend: () => void;
  onStop?: () => void;
  isAgentRunning?: boolean;
  isSending?: boolean;
  disabled?: boolean;
  repositoryPath: string;
  placeholder?: string;
  showAcceptEdits?: boolean;
  acceptEdits?: boolean;
  onAcceptEditsChange?: (value: boolean) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { settings } = useAppSettings();

  // Slash command navigation
  const {
    filteredCommands,
    selectedIndex,
    setSelectedIndex,
    isOpen: showSlashCommands,
    handleKeyDown: handleSlashKeyDown,
    refresh: refreshSlashCommands,
  } = useSlashCommandNavigation({
    searchValue: message,
    repositoryPath,
    onSelect: (command) => {
      onChangeMessage(command + " ");
      textareaRef.current?.focus();
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Let slash command navigation handle first
    if (handleSlashKeyDown(e)) return;

    // Submit on Enter (based on settings)
    if (e.key === "Enter") {
      if (settings.send_with_enter && !e.shiftKey) {
        e.preventDefault();
        onSend();
      } else if (!settings.send_with_enter && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onSend();
      }
    }
  };

  return (
    <div className="relative">
      {/* Slash command dropdown */}
      {showSlashCommands && (
        <SlashCommandsDropdown
          commands={filteredCommands}
          selectedIndex={selectedIndex}
          anchorRef={containerRef}
          onSelect={(cmd) => {
            onChangeMessage(cmd + " ");
            textareaRef.current?.focus();
          }}
          onHover={setSelectedIndex}
          onRefresh={refreshSlashCommands}
        />
      )}

      <div ref={containerRef} className="p-4 bg-popover border border-border rounded-2xl">
        <AutoResizeTextarea
          ref={textareaRef}
          value={message}
          onChange={(e) => onChangeMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "Type / for commands..."}
          disabled={disabled}
          className="p-0 border-none outline-none focus-visible:ring-0"
          maxHeight={150}
        />

        <div className="flex items-center justify-between mt-4">
          {showAcceptEdits ? (
            <Toggle
              pressed={acceptEdits}
              onPressedChange={onAcceptEditsChange}
            >
              Accept edits
            </Toggle>
          ) : (
            <div></div>
          )}

          {isAgentRunning ? (
            <Button
              variant="destructive"
              size="icon-lg"
              onClick={onStop}
            >
              <StopCircle />
            </Button>
          ) : (
            <Button
              variant={message.trim() ? "default" : "ghost"}
              size="icon-lg"
              onClick={onSend}
              disabled={disabled || !message.trim() || isSending}
            >
              <Send />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
