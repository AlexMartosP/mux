import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useToast, Toast as ToastType, ToastType as ToastVariant } from "../contexts/ToastContext";

const typeStyles: Record<ToastVariant, { borderColor: string; iconColor: string; icon: string }> = {
  info: {
    borderColor: "var(--accent-cyan)",
    iconColor: "var(--accent-cyan)",
    icon: "ℹ",
  },
  success: {
    borderColor: "var(--accent-green)",
    iconColor: "var(--accent-green)",
    icon: "✓",
  },
  warning: {
    borderColor: "var(--accent-yellow)",
    iconColor: "var(--accent-yellow)",
    icon: "⚠",
  },
  error: {
    borderColor: "var(--accent-red)",
    iconColor: "var(--accent-red)",
    icon: "✕",
  },
};

function ToastItem({ toast, onDismiss }: { toast: ToastType; onDismiss: () => void }) {
  const [isExiting, setIsExiting] = useState(false);
  const styles = typeStyles[toast.type];

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(onDismiss, 200); // Wait for animation
  };

  return (
    <div
      className={`flex items-start gap-3 p-3 min-w-[300px] max-w-[400px] transition-all duration-200 ${
        isExiting ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"
      }`}
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: `1px solid ${styles.borderColor}`,
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
      }}
    >
      {/* Icon */}
      <span
        className="text-sm font-bold flex-shrink-0 w-5 h-5 flex items-center justify-center"
        style={{ color: styles.iconColor }}
      >
        {styles.icon}
      </span>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
          {toast.title}
        </div>
        {toast.message && (
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {toast.message}
          </div>
        )}
        {toast.action && (
          <button
            onClick={() => {
              toast.action?.onClick();
              handleDismiss();
            }}
            className="text-xs mt-2 font-medium transition-colors"
            style={{ color: styles.iconColor }}
            onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
            onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        className="text-xs flex-shrink-0 transition-colors"
        style={{ color: "var(--text-dim)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-dim)")}
      >
        ✕
      </button>
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || toasts.length === 0) {
    return null;
  }

  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2"
      style={{ pointerEvents: "none" }}
    >
      {toasts.map((toast) => (
        <div key={toast.id} style={{ pointerEvents: "auto" }}>
          <ToastItem toast={toast} onDismiss={() => removeToast(toast.id)} />
        </div>
      ))}
    </div>,
    document.body
  );
}
