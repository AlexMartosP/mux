import { Combobox, ComboboxContent, ComboboxInput, ComboboxTrigger, ComboboxEmpty, ComboboxList, ComboboxItem, ComboboxValue } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BranchInfo } from "@/types/agent";

type BranchItem = BranchInfo | { type: "new-auto" } | { type: "new-custom" };

export function BranchCombobox({
  branches,
  value,
  onChange,
  newBranchMode,
  onNewBranchModeChange,
  label = "[B]",
  placeholder = "Select branch",
  disabled = false,
  showNewBranchOptions = true,
  className,
}: {
  branches: BranchInfo[];
  value: string;
  onChange: (branch: string) => void;
  newBranchMode?: "auto" | "custom" | null;
  onNewBranchModeChange?: (mode: "auto" | "custom" | null) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  showNewBranchOptions?: boolean;
  className?: string;
}) {
  // Build items list
  const items: BranchItem[] = [];

  if (showNewBranchOptions) {
    items.push({ type: "new-auto" } as const);
    items.push({ type: "new-custom" } as const);
  }

  items.push(...branches);

  // Find selected item
  const getSelectedItem = (): BranchItem | null => {
    if (value) {
      return branches.find(b => b.name === value) || null;
    }
    if (newBranchMode === "auto") {
      return { type: "new-auto" };
    }
    if (newBranchMode === "custom") {
      return { type: "new-custom" };
    }
    return null;
  };

  const selectedItem = getSelectedItem();

  // Get display text for the trigger button
  const getDisplayText = () => {
    if (value) return value;
    if (newBranchMode === "auto") return "New branch (auto-generated)";
    if (newBranchMode === "custom") return "New branch (custom name)";
    return placeholder;
  };

  // Handle selection
  const handleValueChange = (item: BranchItem | null) => {
    if (!item) return;

    if ("type" in item) {
      // New branch option
      onChange("");
      if (item.type === "new-auto") {
        onNewBranchModeChange?.("auto");
      } else if (item.type === "new-custom") {
        onNewBranchModeChange?.("custom");
      }
    } else {
      // Existing branch
      onChange(item.name);
      onNewBranchModeChange?.(null);
    }
  };

  // Get item key
  const getItemKey = (item: BranchItem): string => {
    if ("type" in item) {
      return item.type;
    }
    return item.name;
  };

  // Get item label
  const getItemLabel = (item: BranchItem): string => {
    if ("type" in item) {
      if (item.type === "new-auto") return "+ New branch (auto-generated)";
      if (item.type === "new-custom") return "+ New branch (custom name)";
    }
    return item.name;
  };

  const isSelected = value || newBranchMode;

  return (
    <Combobox<BranchItem>
      value={selectedItem}
      onValueChange={handleValueChange}
      disabled={disabled}
    >
      <ComboboxTrigger
        render={
          <Button
            variant="outline"
            disabled={disabled}
            className={cn(
              "justify-between font-normal",
              isSelected ? "border-primary text-foreground" : "text-muted-foreground",
              disabled && "opacity-50 cursor-not-allowed",
              className || "w-full"
            )}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="text-primary flex-shrink-0">{label}</span>
              <span className="truncate">
                <ComboboxValue placeholder={placeholder}>
                  {getDisplayText()}
                </ComboboxValue>
              </span>
            </div>
          </Button>
        }
      />
      <ComboboxContent>
        <ComboboxInput showTrigger={false} placeholder="Search branches..." />
        <ComboboxEmpty>No branches found.</ComboboxEmpty>
        <ComboboxList>
          {items.map((item) => {
            const key = getItemKey(item);
            const label = getItemLabel(item);
            const isNewBranch = "type" in item;
            const isCurrent = !isNewBranch && item.is_current;

            return (
              <ComboboxItem
                key={key}
                value={item}
                className={cn(
                  isNewBranch && "border-b border-border",
                  isNewBranch && "text-primary"
                )}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="truncate">{label}</span>
                  {isCurrent && <span className="text-success ml-2">*</span>}
                </div>
              </ComboboxItem>
            );
          })}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
