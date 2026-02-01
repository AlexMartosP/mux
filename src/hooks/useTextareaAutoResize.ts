import { useEffect, useRef, useCallback } from "react";

interface UseTextareaAutoResizeOptions {
  /** Maximum height in pixels before scrolling */
  maxHeight?: number;
  /** Minimum height in pixels */
  minHeight?: number;
}

/**
 * Hook for auto-resizing textarea based on content.
 * Returns a ref to attach to the textarea element.
 */
export function useTextareaAutoResize(
  value: string,
  options: UseTextareaAutoResizeOptions = {}
) {
  const { maxHeight = 200, minHeight = 38 } = options;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = "auto";

    // Calculate new height
    const newHeight = Math.min(
      Math.max(textarea.scrollHeight, minHeight),
      maxHeight
    );

    textarea.style.height = `${newHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [maxHeight, minHeight]);

  // Resize when value changes
  useEffect(() => {
    resize();
  }, [value, resize]);

  // Also resize on window resize
  useEffect(() => {
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [resize]);

  return { textareaRef, resize };
}
