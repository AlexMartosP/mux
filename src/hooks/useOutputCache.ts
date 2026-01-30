import type { OutputLine } from "../types/agent";

interface CachedOutput {
  output: OutputLine[];
  totalCount: number;
  loadedCount: number;
}

const MAX_CACHED_TASKS = 20;

// LRU cache: map preserves insertion order, we delete oldest when over limit
const cache = new Map<string, CachedOutput>();

export function getCachedOutput(taskId: string): CachedOutput | undefined {
  const entry = cache.get(taskId);
  if (entry) {
    // Move to end (most recently used)
    cache.delete(taskId);
    cache.set(taskId, entry);
  }
  return entry;
}

export function setCachedOutput(taskId: string, data: CachedOutput): void {
  cache.delete(taskId); // Remove old position
  cache.set(taskId, data);

  // Evict oldest if over limit
  if (cache.size > MAX_CACHED_TASKS) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

export function appendCachedOutput(taskId: string, newLines: OutputLine[]): void {
  const entry = cache.get(taskId);
  if (!entry) {
    // Entry doesn't exist - this can happen if cache was evicted or never created
    // This is not an error, just skip the append
    return;
  }
  entry.output = entry.output.concat(newLines);
  entry.totalCount += newLines.length;
  entry.loadedCount += newLines.length;
}

export function clearCachedOutput(taskId: string): void {
  cache.delete(taskId);
}
