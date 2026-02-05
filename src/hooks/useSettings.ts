import { useState, useEffect, useCallback, useRef } from "react";
import * as tauri from "../domains/tauri/commands";
import type { AppSettings } from "../domains/tauri/commands";

// Settings cache with TTL
interface SettingsCache {
  settings: AppSettings | null;
  timestamp: number;
}

// Cache TTL: 5 minutes (settings don't change often)
const CACHE_TTL = 5 * 60 * 1000;

// Global cache to share across all hook instances
let settingsCache: SettingsCache = {
  settings: null,
  timestamp: 0,
};

// Subscribers for settings updates
const subscribers = new Set<(settings: AppSettings) => void>();

/**
 * Hook for accessing app settings with caching.
 * Settings are cached globally and shared across all components using this hook.
 * Cache is invalidated after 5 minutes or when updateSettings is called.
 */
export function useSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(settingsCache.settings);
  const [isLoading, setIsLoading] = useState(settingsCache.settings === null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Subscribe to settings updates
  useEffect(() => {
    mountedRef.current = true;

    const handleUpdate = (newSettings: AppSettings) => {
      if (mountedRef.current) {
        setSettings(newSettings);
      }
    };

    subscribers.add(handleUpdate);

    return () => {
      mountedRef.current = false;
      subscribers.delete(handleUpdate);
    };
  }, []);

  // Load settings (from cache or fresh)
  const loadSettings = useCallback(async (forceRefresh = false) => {
    const now = Date.now();

    // Use cache if valid and not forcing refresh
    if (!forceRefresh && settingsCache.settings && (now - settingsCache.timestamp) < CACHE_TTL) {
      if (mountedRef.current) {
        setSettings(settingsCache.settings);
        setIsLoading(false);
      }
      return settingsCache.settings;
    }

    try {
      if (mountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      const loaded = await tauri.getSettings();

      // Update global cache
      settingsCache = {
        settings: loaded,
        timestamp: now,
      };

      // Notify all subscribers
      subscribers.forEach(fn => fn(loaded));

      if (mountedRef.current) {
        setIsLoading(false);
      }

      return loaded;
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to load settings");
        setIsLoading(false);
      }
      return null;
    }
  }, []);

  // Update settings and invalidate cache
  const updateSettings = useCallback(async (newSettings: AppSettings) => {
    try {
      await tauri.updateSettings(newSettings);

      // Update global cache
      settingsCache = {
        settings: newSettings,
        timestamp: Date.now(),
      };

      // Notify all subscribers
      subscribers.forEach(fn => fn(newSettings));

      return true;
    } catch (err) {
      if (mountedRef.current) {
        setError(err instanceof Error ? err.message : "Failed to update settings");
      }
      return false;
    }
  }, []);

  // Invalidate cache (for when settings might have changed externally)
  const invalidateCache = useCallback(() => {
    settingsCache = {
      settings: null,
      timestamp: 0,
    };
  }, []);

  // Load on mount
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  return {
    settings,
    isLoading,
    error,
    loadSettings,
    updateSettings,
    invalidateCache,
  };
}

// Export for use in non-hook contexts (e.g., event handlers)
export async function getCachedSettings(): Promise<AppSettings | null> {
  const now = Date.now();

  if (settingsCache.settings && (now - settingsCache.timestamp) < CACHE_TTL) {
    return settingsCache.settings;
  }

  try {
    const loaded = await tauri.getSettings();
    settingsCache = {
      settings: loaded,
      timestamp: now,
    };
    return loaded;
  } catch {
    return null;
  }
}
