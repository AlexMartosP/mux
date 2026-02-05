import * as React from "react";
import { cn } from "@/lib/utils";

interface ListboxProps<T> {
  items: T[];
  selectedIndex: number;
  onSelect: (item: T, index: number) => void;
  onHover: (index: number) => void;
  renderItem: (item: T, index: number, isSelected: boolean) => React.ReactNode;
  getKey: (item: T, index: number) => string | number;
  className?: string;
  itemClassName?: string;
}

interface ListboxRef {
  scrollSelectedIntoView: () => void;
}

/**
 * A keyboard-navigable listbox component.
 * Handles rendering items with selection state and hover interactions.
 * Parent component should manage keyboard events via useListboxNavigation hook.
 */
const Listbox = React.forwardRef(function Listbox<T>(
  {
    items,
    selectedIndex,
    onSelect,
    onHover,
    renderItem,
    getKey,
    className,
    itemClassName,
  }: ListboxProps<T>,
  ref: React.ForwardedRef<ListboxRef>
) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  const scrollSelectedIntoView = React.useCallback(() => {
    const container = containerRef.current;
    const item = container?.querySelector(`[data-index="${selectedIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  React.useImperativeHandle(ref, () => ({
    scrollSelectedIntoView,
  }));

  // Auto-scroll when selection changes
  React.useEffect(() => {
    scrollSelectedIntoView();
  }, [selectedIndex, scrollSelectedIntoView]);

  if (items.length === 0) return null;

  return (
    <div ref={containerRef} className={cn("overflow-y-auto", className)} role="listbox">
      {items.map((item, index) => (
        <div
          key={getKey(item, index)}
          data-index={index}
          role="option"
          aria-selected={index === selectedIndex}
          onClick={() => onSelect(item, index)}
          onMouseEnter={() => onHover(index)}
          className={cn(
            "cursor-pointer",
            index === selectedIndex && "bg-muted",
            index !== selectedIndex && "hover:bg-muted/50",
            itemClassName
          )}
        >
          {renderItem(item, index, index === selectedIndex)}
        </div>
      ))}
    </div>
  );
}) as <T>(
  props: ListboxProps<T> & { ref?: React.ForwardedRef<ListboxRef> }
) => React.ReactElement | null;

interface UseListboxNavigationOptions<T> {
  items: T[];
  isOpen: boolean;
  onSelect: (item: T) => void;
  onClose: () => void;
}

interface UseListboxNavigationReturn {
  selectedIndex: number;
  setSelectedIndex: React.Dispatch<React.SetStateAction<number>>;
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  resetSelection: () => void;
}

/**
 * Hook for managing listbox keyboard navigation.
 * Returns selectedIndex state and handleKeyDown that returns true if event was handled.
 */
function useListboxNavigation<T>({
  items,
  isOpen,
  onSelect,
  onClose,
}: UseListboxNavigationOptions<T>): UseListboxNavigationReturn {
  const [selectedIndex, setSelectedIndex] = React.useState(0);

  // Reset selection when items change
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [items.length]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!isOpen || items.length === 0) return false;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % items.length);
          return true;

        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + items.length) % items.length);
          return true;

        case "Tab":
        case "Enter":
          // Don't intercept Enter with modifiers (shift for newline, cmd/ctrl for submit)
          if (e.key === "Enter" && (e.shiftKey || e.metaKey || e.ctrlKey)) {
            return false;
          }
          e.preventDefault();
          onSelect(items[selectedIndex]);
          return true;

        case "Escape":
          e.preventDefault();
          onClose();
          return true;

        default:
          return false;
      }
    },
    [isOpen, items, selectedIndex, onSelect, onClose]
  );

  const resetSelection = React.useCallback(() => {
    setSelectedIndex(0);
  }, []);

  return {
    selectedIndex,
    setSelectedIndex,
    handleKeyDown,
    resetSelection,
  };
}

export { Listbox, useListboxNavigation };
export type { ListboxProps, ListboxRef, UseListboxNavigationOptions, UseListboxNavigationReturn };
