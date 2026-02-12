import { useState, useMemo } from "react";
import { Combobox, ComboboxContent, ComboboxInput, ComboboxTrigger, ComboboxEmpty, ComboboxList, ComboboxItem, ComboboxValue, ComboboxGroup, ComboboxLabel } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BranchInfo } from "@/types/agent";
import { useRecentItems } from "@/hooks/useRecentItems";

type BranchItem = BranchInfo | { type: "new-auto" } | { type: "new-custom" };
type BranchSection = {
  type: 'section';
  label?: string;
  items: BranchItem[];
};

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
  repositoryPath,
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
  repositoryPath?: string;
}) {
  const [searchValue, setSearchValue] = useState("");
  const { recentItems, addRecentItem } = useRecentItems<string>(
    `mux-recent-branches-${repositoryPath || 'default'}`,
    5
  );
  // Build new branch options
  const newBranchOptions: BranchItem[] = [];
  if (showNewBranchOptions) {
    newBranchOptions.push({ type: "new-auto" } as const);
    newBranchOptions.push({ type: "new-custom" } as const);
  }

  // Helper to flatten items
  const flattenItems = (items: (BranchItem | BranchSection)[]): BranchItem[] => {
    const result: BranchItem[] = [];
    for (const item of items) {
      if ('type' in item && item.type === 'section') {
        result.push(...item.items);
      } else {
        result.push(item as BranchItem);
      }
    }
    return result;
  };

  // Build items based on search state
  const items: (BranchItem | BranchSection)[] = useMemo(() => {
    if (searchValue === "") {
      // Not searching: show new branch options + sections
      const recentBranches = recentItems
        .map((branchName) => branches.find((b) => b.name === branchName))
        .filter((b): b is BranchInfo => b !== undefined);

      const recentBranchNames = new Set(recentBranches.map((b) => b.name));
      const allBranchesExcludingRecent = branches.filter((b) => !recentBranchNames.has(b.name));

      const sections: (BranchItem | BranchSection)[] = [];

      // Add new branch options section (unlabeled)
      if (newBranchOptions.length > 0) {
        sections.push({
          type: 'section' as const,
          items: newBranchOptions,
        });
      }

      // Add recent branches section if we have any
      if (recentBranches.length > 0) {
        sections.push({
          type: 'section' as const,
          label: 'Recently used',
          items: recentBranches,
        });
      }

      // Add all branches section
      sections.push({
        type: 'section' as const,
        label: recentBranches.length > 0 ? 'All' : undefined,
        items: allBranchesExcludingRecent,
      });

      return sections;
    }

    // Searching: filter branches manually and return as flat list
    const searchLower = searchValue.toLowerCase();
    const filteredBranches = branches.filter((b) =>
      b.name.toLowerCase().includes(searchLower)
    );
    return filteredBranches;
  }, [searchValue, recentItems, branches, newBranchOptions]);

  // Flatten all items for selection lookup
  const allItems = useMemo(() => flattenItems(items), [items]);

  // Find selected item from all items
  const selectedItem = useMemo(() => {
    if (value) {
      return allItems.find(item => {
        if ("type" in item && (item.type === "new-auto" || item.type === "new-custom")) {
          return false;
        }
        return (item as BranchInfo).name === value;
      }) || null;
    }
    if (newBranchMode === "auto") {
      return { type: "new-auto" } as const;
    }
    if (newBranchMode === "custom") {
      return { type: "new-custom" } as const;
    }
    return null;
  }, [value, newBranchMode, allItems]);

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

    if ("type" in item && (item.type === "new-auto" || item.type === "new-custom")) {
      // New branch option
      onChange("");
      if (item.type === "new-auto") {
        onNewBranchModeChange?.("auto");
      } else if (item.type === "new-custom") {
        onNewBranchModeChange?.("custom");
      }
    } else {
      // Existing branch
      const branchInfo = item as BranchInfo;
      onChange(branchInfo.name);
      onNewBranchModeChange?.(null);

      // Add to recent items
      addRecentItem(branchInfo.name);
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
      <ComboboxContent className="min-w-[400px]">
        <ComboboxInput
          showTrigger={false}
          placeholder="Search branches..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
        />
        {allItems.length === 0 && <ComboboxEmpty>No branches found.</ComboboxEmpty>}
        <ComboboxList>
          {items.map((item, idx) => {
            // Check if this is a section
            if ('type' in item && item.type === 'section') {
              return (
                <ComboboxGroup key={idx}>
                  {item.label && <ComboboxLabel>{item.label}</ComboboxLabel>}
                  {item.items.map((subItem) => {
                    const key = getItemKey(subItem);
                    const label = getItemLabel(subItem);
                    const isNewBranch = "type" in subItem && (subItem.type === "new-auto" || subItem.type === "new-custom");
                    const isCurrent = !isNewBranch && (subItem as BranchInfo).is_current;

                    return (
                      <ComboboxItem
                        key={key}
                        value={subItem}
                        className={cn(isNewBranch && "text-primary")}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className="truncate">{label}</span>
                          {isCurrent && <span className="text-success ml-2">*</span>}
                        </div>
                      </ComboboxItem>
                    );
                  })}
                </ComboboxGroup>
              );
            }

            // Plain item (when searching)
            const branchItem = item as BranchItem;
            const key = getItemKey(branchItem);
            const label = getItemLabel(branchItem);
            const isCurrent = "is_current" in branchItem && branchItem.is_current;

            return (
              <ComboboxItem key={key} value={branchItem}>
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
