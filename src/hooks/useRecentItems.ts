import { useState, useCallback, useEffect } from "react";

/**
 * Generic hook for tracking recently used items in localStorage.
 * Items are stored as a JSON array and automatically deduplicated.
 *
 * @param storageKey - localStorage key (e.g., 'mux-recent-branches-{repoPath}')
 * @param maxItems - Maximum number of recent items to store (default: 5)
 * @returns Object with recentItems array and methods to add/clear items
 *
 * @example
 * ```ts
 * const { recentItems, addRecentItem } = useRecentItems<string>('mux-recent-branches', 5);
 * ```
 */
export function useRecentItems<T>(
  storageKey: string,
  maxItems: number = 5
): {
  recentItems: T[];
  addRecentItem: (item: T) => void;
  clearRecentItems: () => void;
} {
  // Initialize from localStorage
  const [recentItems, setRecentItems] = useState<T[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return [];

      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed.slice(0, maxItems) : [];
    } catch (error) {
      console.warn(`Failed to load recent items from ${storageKey}:`, error);
      return [];
    }
  });

  // Sync to localStorage whenever recentItems changes
  useEffect(() => {
    try {
      if (recentItems.length > 0) {
        localStorage.setItem(storageKey, JSON.stringify(recentItems));
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch (error) {
      console.warn(`Failed to save recent items to ${storageKey}:`, error);
    }
  }, [storageKey, recentItems]);

  /**
   * Add an item to recent items.
   * - If item already exists, it moves to the top
   * - New items are prepended
   * - List is limited to maxItems
   */
  const addRecentItem = useCallback((item: T) => {
    setRecentItems((prev) => {
      // Deduplicate: remove existing instance of this item
      const filtered = prev.filter((existing) => {
        // Use deep equality for objects, strict equality for primitives
        if (typeof item === "object" && item !== null && typeof existing === "object" && existing !== null) {
          return JSON.stringify(existing) !== JSON.stringify(item);
        }
        return existing !== item;
      });

      // Prepend new item and limit to maxItems
      return [item, ...filtered].slice(0, maxItems);
    });
  }, [maxItems]);

  /**
   * Clear all recent items from state and localStorage
   */
  const clearRecentItems = useCallback(() => {
    setRecentItems([]);
    try {
      localStorage.removeItem(storageKey);
    } catch (error) {
      console.warn(`Failed to clear recent items from ${storageKey}:`, error);
    }
  }, [storageKey]);

  return {
    recentItems,
    addRecentItem,
    clearRecentItems,
  };
}
