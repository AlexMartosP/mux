import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export function SlidingText({ text, className }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowAmount, setOverflowAmount] = useState(0);
  const [isHovering, setIsHovering] = useState(false);

  useEffect(() => {
    const checkOverflow = () => {
      if (containerRef.current && textRef.current) {
        const overflow = textRef.current.scrollWidth - containerRef.current.clientWidth;
        setOverflowAmount(overflow > 0 ? overflow : 0);
      }
    };

    checkOverflow();

    const resizeObserver = new ResizeObserver(checkOverflow);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [text]);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <span
        ref={textRef}
        className="inline-block whitespace-nowrap transition-transform duration-[2000ms] ease-linear"
        style={{
          transform: isHovering && overflowAmount > 0
            ? `translateX(-${overflowAmount}px)`
            : "translateX(0)",
        }}
      >
        {text}
      </span>
    </div>
  );
}
