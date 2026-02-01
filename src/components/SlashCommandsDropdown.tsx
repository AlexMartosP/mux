import { forwardRef } from "react";
import { ArrowUp, ArrowDown, RefreshCw } from "lucide-react";
import type { SlashCommand } from "../lib/tauri";

interface SlashCommandsDropdownProps {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (command: string) => void;
  onHover: (index: number) => void;
  onRefresh: () => void;
}

/**
 * Reusable slash commands dropdown for command autocompletion.
 * Used in both new task form and follow-up input.
 */
export const SlashCommandsDropdown = forwardRef<HTMLDivElement, SlashCommandsDropdownProps>(
  function SlashCommandsDropdown(
    { commands, selectedIndex, onSelect, onHover, onRefresh },
    ref
  ) {
    if (commands.length === 0) return null;

    return (
      <div
        ref={ref}
        className="absolute bottom-full left-0 right-0 mb-1 flex flex-col bg-popover border border-input rounded-md z-50 max-h-60 overflow-hidden"
      >
        <div className="flex-1 overflow-y-auto">
          {commands.map((cmd, index) => (
            <button
              key={cmd.command}
              data-index={index}
              onClick={() => onSelect(cmd.command)}
              className={`w-full text-left px-3 py-2 flex items-center gap-3 transition-colors text-xs ${
                index === selectedIndex ? "bg-muted" : "hover:bg-muted/50"
              }`}
              onMouseEnter={() => onHover(index)}
            >
              <span className="font-medium text-primary">{cmd.command}</span>
              <span className="flex-1 truncate text-muted-foreground">
                {cmd.description}
              </span>
              <span
                className={`px-1.5 py-0.5 bg-background border border-border rounded text-[10px] ${
                  cmd.source === "project"
                    ? "text-success"
                    : cmd.source === "global"
                    ? "text-warning"
                    : "text-muted-foreground"
                }`}
              >
                {cmd.source}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between px-3 py-2 text-xs text-muted-foreground border-t border-border">
          <span className="flex items-center gap-1">
            <ArrowUp size={12} strokeWidth={1.5} />
            <ArrowDown size={12} strokeWidth={1.5} />
            <span>navigate • Tab select • Esc close</span>
          </span>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRefresh();
            }}
            className="text-muted-foreground hover:text-primary transition-colors"
            title="Refresh commands"
          >
            <RefreshCw size={12} strokeWidth={1.5} />
          </button>
        </div>
      </div>
    );
  }
);
