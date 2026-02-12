import { Combobox, ComboboxContent, ComboboxInput, ComboboxTrigger, ComboboxEmpty, ComboboxList, ComboboxItem, ComboboxValue, ComboboxGroup, ComboboxLabel } from "@/components/ui/combobox";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { type ReactNode } from "react";

// Section object type
type SectionItem<T> = {
  type: 'section';
  label?: string;
  items: T[];
};

// Item can be either a plain item T or a section containing items
type ComboboxItemType<T> = T | SectionItem<T>;

// Type guard to check if an item is a section
function isSectionItem<T>(item: ComboboxItemType<T>): item is SectionItem<T> {
  return typeof item === 'object' && item !== null && 'type' in item && item.type === 'section';
}

// Helper to flatten all items from sections and plain items
function flattenItems<T>(items: ComboboxItemType<T>[]): T[] {
  const result: T[] = [];
  for (const item of items) {
    if (isSectionItem(item)) {
      result.push(...item.items);
    } else {
      result.push(item);
    }
  }
  return result;
}

export function ComboboxPopover<T = { label: string; value: string }>({
  items,
  value,
  onChange,
  className,
  placeholder = "Select...",
  searchPlaceholder = "Search",
  searchValue,
  onSearchChange,
  getItemKey,
  getItemLabel,
  renderItem,
}: {
  value: string;
  onChange: (value: string) => void;
  items: ComboboxItemType<T>[];
  className?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  getItemKey?: (item: T) => string;
  getItemLabel?: (item: T) => string;
  renderItem?: (item: T) => ReactNode;
}) {
  // Default accessors for backward compatibility with { label, value } objects
  const itemKey = getItemKey ?? ((item: any) => item.value);
  const itemLabel = getItemLabel ?? ((item: any) => item.label);

  // Flatten all items to find the selected one
  const allItems = flattenItems(items);
  const selectedItem = allItems.find((item) => itemKey(item) === value) ?? null;

  return (
    <Combobox
      value={selectedItem}
      onValueChange={(item) => onChange(item ? itemKey(item) : "")}
    >
      <ComboboxTrigger render={<Button variant="outline" className={cn("justify-between font-normal", className || "w-full")}><ComboboxValue placeholder={placeholder} /></Button>} />
      <ComboboxContent className="min-w-[400px]">
        <ComboboxInput
          showTrigger={false}
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange?.(e.target.value)}
        />
        {allItems.length === 0 && <ComboboxEmpty>No items found.</ComboboxEmpty>}
        <ComboboxList>
          {items.map((item, idx) => {
            if (isSectionItem(item)) {
              return (
                <ComboboxGroup key={idx}>
                  {item.label && <ComboboxLabel>{item.label}</ComboboxLabel>}
                  {item.items.map((subItem) => (
                    <ComboboxItem key={itemKey(subItem)} value={subItem}>
                      {renderItem ? renderItem(subItem) : itemLabel(subItem)}
                    </ComboboxItem>
                  ))}
                </ComboboxGroup>
              );
            }
            return (
              <ComboboxItem key={itemKey(item)} value={item}>
                {renderItem ? renderItem(item) : itemLabel(item)}
              </ComboboxItem>
            );
          })}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
