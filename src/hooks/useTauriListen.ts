import { useEffect, useRef } from "react";
import { listen, type UnlistenFn, type EventCallback } from "@tauri-apps/api/event";

/**
 * Reusable hook for listening to Tauri events.
 * Uses callback ref pattern - no deps needed, always has latest callback.
 */
export function useTauriListen<T>(
  eventName: string,
  callback: EventCallback<T>
) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let unlisten: UnlistenFn | null = null;
    let cancelled = false;

    listen<T>(eventName, (event) => {
      callbackRef.current(event);
    }).then((fn) => {
      if (cancelled) {
        // Effect was cleaned up before promise resolved, unsubscribe immediately
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [eventName]);
}
