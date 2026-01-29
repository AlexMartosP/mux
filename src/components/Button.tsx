import { forwardRef, ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonColor = "cyan" | "green" | "yellow" | "red" | "default";
type ButtonSize = "default" | "sm" | "icon";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  color?: ButtonColor;
  size?: ButtonSize;
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  active?: boolean;
  children?: ReactNode;
}

const colorMap: Record<ButtonColor, string> = {
  cyan: "var(--accent-cyan)",
  green: "var(--accent-green)",
  yellow: "var(--accent-yellow)",
  red: "var(--accent-red)",
  default: "var(--text-secondary)",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      color = "cyan",
      size = "default",
      startIcon,
      endIcon,
      active = false,
      children,
      className = "",
      disabled,
      style,
      ...props
    },
    ref
  ) => {
    const accentColor = colorMap[color];

    const baseStyles: React.CSSProperties = {
      borderRadius: "var(--border-radius)",
      transition: "all var(--duration-normal) var(--easing-default)",
      fontWeight: 500,
      fontSize: "12px",
      cursor: disabled ? "not-allowed" : "pointer",
      opacity: disabled ? "var(--opacity-disabled)" : 1,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--space-2)",
    };

    const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
      default: {
        padding: "6px 12px",
      },
      sm: {
        padding: "4px 8px",
        fontSize: "11px",
      },
      icon: {
        padding: "8px",
        width: "32px",
        height: "32px",
      },
    };

    const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
      primary: {
        backgroundColor: accentColor,
        border: `1px solid ${accentColor}`,
        color: "var(--bg-primary)",
      },
      secondary: {
        backgroundColor: "transparent",
        border: `1px solid ${accentColor}`,
        color: accentColor,
      },
      ghost: {
        backgroundColor: "transparent",
        border: "1px solid transparent",
        color: active ? "var(--accent-cyan)" : "var(--text-dim)",
      },
    };

    const handleMouseEnter = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      const target = e.currentTarget;

      switch (variant) {
        case "primary":
          target.style.opacity = "0.9";
          break;
        case "secondary":
          target.style.backgroundColor = accentColor;
          target.style.color = "var(--bg-primary)";
          break;
        case "ghost":
          // Only change color if not active
          if (!active) {
            target.style.color = "var(--text-secondary)";
          }
          break;
      }
    };

    const handleMouseLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (disabled) return;
      const target = e.currentTarget;

      switch (variant) {
        case "primary":
          target.style.opacity = "1";
          break;
        case "secondary":
          target.style.backgroundColor = "transparent";
          target.style.color = accentColor;
          break;
        case "ghost":
          // Restore color based on active state
          target.style.color = active ? "var(--accent-cyan)" : "var(--text-dim)";
          break;
      }
    };

    // Build class names
    const classNames = [
      "btn",
      `btn-${variant}`,
      `btn-${size}`,
      active && variant === "ghost" ? "active" : "",
      className,
    ].filter(Boolean).join(" ");

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={classNames}
        style={{
          ...baseStyles,
          ...sizeStyles[size],
          ...variantStyles[variant],
          ...style,
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        {...props}
      >
        {startIcon}
        {children}
        {endIcon}
      </button>
    );
  }
);

Button.displayName = "Button";
