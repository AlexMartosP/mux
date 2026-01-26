import { useState, useEffect, useCallback, useRef } from "react";
import * as tauri from "../lib/tauri";
import type { SlashCommand } from "../lib/tauri";

interface CacheEntry {
  commands: SlashCommand[];
  timestamp: number;
}

// Global cache shared across all hook instances
const commandCache = new Map<string, CacheEntry>();

// Cache TTL in milliseconds (5 minutes)
const CACHE_TTL = 5 * 60 * 1000;

/**
 * Hook for fetching slash commands with caching.
 * Commands are cached per repository path and refreshed after TTL expires.
 */
export function useSlashCommands(repositoryPath: string | undefined) {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const lastFetchedPath = useRef<string | undefined>(undefined);

  const fetchCommands = useCallback(async (path: string | undefined, forceRefresh = false) => {
    const cacheKey = path || "__global__";
    const cached = commandCache.get(cacheKey);
    const now = Date.now();

    // Use cache if valid and not forcing refresh
    if (!forceRefresh && cached && (now - cached.timestamp) < CACHE_TTL) {
      setCommands(cached.commands);
      return cached.commands;
    }

    setIsLoading(true);
    try {
      const fetchedCommands = await tauri.getSlashCommands(path);

      // Update cache
      commandCache.set(cacheKey, {
        commands: fetchedCommands,
        timestamp: now,
      });

      setCommands(fetchedCommands);
      return fetchedCommands;
    } catch (err) {
      console.error("Failed to fetch slash commands:", err);
      // On error, return cached data if available
      if (cached) {
        setCommands(cached.commands);
        return cached.commands;
      }
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch when repository path changes
  useEffect(() => {
    // Skip if path hasn't actually changed
    if (lastFetchedPath.current === repositoryPath) {
      return;
    }
    lastFetchedPath.current = repositoryPath;
    fetchCommands(repositoryPath);
  }, [repositoryPath, fetchCommands]);

  // Manual refresh function
  const refresh = useCallback(() => {
    return fetchCommands(repositoryPath, true);
  }, [repositoryPath, fetchCommands]);

  // Invalidate cache for a specific path (useful when commands are modified)
  const invalidateCache = useCallback((path?: string) => {
    const cacheKey = path || "__global__";
    commandCache.delete(cacheKey);
  }, []);

  // Clear entire cache
  const clearCache = useCallback(() => {
    commandCache.clear();
  }, []);

  return {
    commands,
    isLoading,
    refresh,
    invalidateCache,
    clearCache,
  };
}

// Export cache utilities for external use
export const slashCommandCache = {
  invalidate: (path?: string) => {
    const cacheKey = path || "__global__";
    commandCache.delete(cacheKey);
  },
  clear: () => {
    commandCache.clear();
  },
};
