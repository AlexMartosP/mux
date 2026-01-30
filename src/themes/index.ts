export interface Theme {
  id: string;
  name: string;
  description: string;
  variables: Record<string, string>;
}

export const terminalTheme: Theme = {
  id: "terminal",
  name: "Terminal",
  description: "Dark, monospace, hacker aesthetic",
  variables: {
    // Backgrounds
    "--bg-primary": "#0a0a0a",
    "--bg-surface": "#141414",
    "--bg-elevated": "#1a1a1a",
    "--bg-hover": "#1f1f1f",

    // Borders
    "--border-default": "#262626",
    "--border-active": "#404040",

    // Text
    "--text-primary": "#e5e5e5",
    "--text-secondary": "#a3a3a3",
    "--text-dim": "#525252",

    // Accents
    "--accent-cyan": "#06b6d4",
    "--accent-green": "#4ade80",
    "--accent-yellow": "#facc15",
    "--accent-red": "#f87171",

    // Subtle Backgrounds (State overlays)
    "--bg-accent-subtle": "rgba(6, 182, 212, 0.08)",
    "--bg-success-subtle": "rgba(74, 222, 128, 0.08)",
    "--bg-warning-subtle": "rgba(250, 204, 21, 0.08)",
    "--bg-error-subtle": "rgba(248, 113, 113, 0.08)",
    "--bg-overlay": "rgba(0, 0, 0, 0.8)",

    // Spacing
    "--space-1": "4px",
    "--space-2": "8px",
    "--space-3": "12px",
    "--space-4": "16px",
    "--space-5": "20px",
    "--space-6": "24px",
    "--space-8": "32px",
    "--space-10": "40px",
    "--space-12": "48px",

    // Transitions
    "--duration-fast": "100ms",
    "--duration-normal": "150ms",
    "--duration-slow": "300ms",
    "--easing-default": "ease",
    "--easing-in-out": "cubic-bezier(0.4, 0, 0.2, 1)",

    // Z-Index
    "--z-base": "0",
    "--z-dropdown": "100",
    "--z-sticky": "200",
    "--z-modal": "300",
    "--z-toast": "400",

    // Focus
    "--focus-ring": "0 0 0 2px var(--bg-primary), 0 0 0 4px var(--accent-cyan)",

    // Disabled
    "--opacity-disabled": "0.4",

    // Line Height
    "--leading-tight": "1.25",
    "--leading-normal": "1.5",
    "--leading-relaxed": "1.75",

    // Icon Sizes
    "--icon-sm": "14px",
    "--icon-md": "16px",
    "--icon-lg": "20px",
    "--icon-xl": "24px",

    // Typography
    "--font-family": "'Geist Mono', monospace",

    // Shape
    "--border-radius": "4px",

    // Caret
    "--caret-color": "#4ade80",
  },
};

export const themes: Theme[] = [terminalTheme];

export const getThemeById = (id: string): Theme => {
  return themes.find((t) => t.id === id) || terminalTheme;
};
