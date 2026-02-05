import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { ArrowUp, ArrowDown, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Listbox } from "@/components/ui/listbox";
import type { SlashCommand } from "@/domains/tauri/commands";

interface SlashCommandsDropdownProps {
  /** Filtered commands to display */
  commands: SlashCommand[];
  /** Currently selected index */
  selectedIndex: number;
  /** Element to anchor the dropdown to */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Called when a command is selected (click) */
  onSelect: (command: string) => void;
  /** Called when hovering over a command */
  onHover: (index: number) => void;
  /** Called when refresh button is clicked */
  onRefresh: () => void;
}

/**
 * Presentational slash commands dropdown.
 * Parent component handles keyboard navigation via useSlashCommandNavigation hook.
 */
export function SlashCommandsDropdown({
  commands,
  selectedIndex,
  anchorRef,
  onSelect,
  onHover,
  onRefresh,
}: SlashCommandsDropdownProps) {
  if (commands.length === 0) return null;

  return (
    <PopoverPrimitive.Root open>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="top"
          sideOffset={4}
          align="start"
          anchor={anchorRef}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            className={cn(
              "bg-popover text-popover-foreground",
              "ring-foreground/10 rounded-md shadow-md ring-1",
              "w-(--anchor-width) max-h-60 overflow-hidden",
              "flex flex-col",
            )}
            initialFocus={false}
            onMouseDown={(e) => e.preventDefault()}
          >
            <Listbox
              items={commands}
              selectedIndex={selectedIndex}
              onSelect={(cmd) => onSelect(cmd.command)}
              onHover={onHover}
              getKey={(cmd) => cmd.command}
              className="flex-1 overflow-y-auto"
              itemClassName="w-full text-left px-3 py-2 flex items-center gap-3 transition-colors text-xs"
              renderItem={(cmd) => (
                <>
                  <span className="font-medium text-primary">{cmd.command}</span>
                  <span className="flex-1 truncate text-muted-foreground">
                    {cmd.description}
                  </span>
                  <span
                    className={cn(
                      "px-1.5 py-0.5 bg-background border border-border rounded text-[10px]",
                      cmd.source === "project" && "text-success",
                      cmd.source === "global" && "text-warning",
                      cmd.source === "builtin" && "text-muted-foreground"
                    )}
                  >
                    {cmd.source}
                  </span>
                </>
              )}
            />
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
                tabIndex={-1}
                className="text-muted-foreground hover:text-primary transition-colors"
                title="Refresh commands"
              >
                <RefreshCw size={12} strokeWidth={1.5} />
              </button>
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
