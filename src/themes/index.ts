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

    // Borders
    "--border-default": "#2a2a2a",
    "--border-active": "#3a3a3a",
    "--border-bright": "#4a4a4a",

    // Text
    "--text-primary": "#ffffff",
    "--text-secondary": "#a0a0a0",
    "--text-dim": "#606060",

    // Accents
    "--accent-green": "#00ff00",
    "--accent-yellow": "#ffff00",
    "--accent-red": "#ff4444",
    "--accent-cyan": "#00ffff",
    "--accent-magenta": "#ff00ff",
    "--accent-orange": "#f97316",

    // Typography
    "--font-family": '"Geist Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    "--font-mono": '"Geist Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',

    // Shape
    "--border-radius": "0px",
    "--border-radius-sm": "0px",
    "--border-radius-lg": "0px",

    // Shadows
    "--shadow-sm": "none",
    "--shadow-md": "none",
    "--shadow-lg": "none",

    // Caret
    "--caret-color": "#00ff00",
  },
};

export const cleanTheme: Theme = {
  id: "clean",
  name: "Clean",
  description: "Modern dashboard with rounded corners and shadows",
  variables: {
    // Backgrounds - softer dark with slight blue tint
    "--bg-primary": "#0f172a",
    "--bg-surface": "#1e293b",
    "--bg-elevated": "#334155",

    // Borders - subtle
    "--border-default": "#334155",
    "--border-active": "#475569",
    "--border-bright": "#64748b",

    // Text
    "--text-primary": "#f1f5f9",
    "--text-secondary": "#94a3b8",
    "--text-dim": "#64748b",

    // Accents - modern, vibrant but not harsh
    "--accent-green": "#22c55e",
    "--accent-yellow": "#eab308",
    "--accent-red": "#ef4444",
    "--accent-cyan": "#06b6d4",
    "--accent-magenta": "#a855f7",
    "--accent-orange": "#f97316",

    // Typography - sans-serif
    "--font-family": '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    "--font-mono": '"Geist Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',

    // Shape - rounded
    "--border-radius": "8px",
    "--border-radius-sm": "6px",
    "--border-radius-lg": "12px",

    // Shadows - more pronounced for depth
    "--shadow-sm": "0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)",
    "--shadow-md": "0 4px 6px rgba(0, 0, 0, 0.3), 0 2px 4px rgba(0, 0, 0, 0.2)",
    "--shadow-lg": "0 10px 25px rgba(0, 0, 0, 0.4), 0 6px 10px rgba(0, 0, 0, 0.2)",

    // Caret
    "--caret-color": "#06b6d4",
  },
};

export const cleanLightTheme: Theme = {
  id: "clean-light",
  name: "Clean Light",
  description: "Modern light theme with rounded corners and soft shadows",
  variables: {
    // Backgrounds - clean white/gray
    "--bg-primary": "#f8fafc",
    "--bg-surface": "#ffffff",
    "--bg-elevated": "#f1f5f9",

    // Borders - subtle gray
    "--border-default": "#e2e8f0",
    "--border-active": "#cbd5e1",
    "--border-bright": "#94a3b8",

    // Text - dark for contrast
    "--text-primary": "#0f172a",
    "--text-secondary": "#475569",
    "--text-dim": "#94a3b8",

    // Accents - vibrant
    "--accent-green": "#16a34a",
    "--accent-yellow": "#ca8a04",
    "--accent-red": "#dc2626",
    "--accent-cyan": "#0891b2",
    "--accent-magenta": "#9333ea",
    "--accent-orange": "#ea580c",

    // Typography
    "--font-family": '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    "--font-mono": '"Geist Mono", ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',

    // Shape - rounded
    "--border-radius": "8px",
    "--border-radius-sm": "6px",
    "--border-radius-lg": "12px",

    // Shadows - soft and elegant
    "--shadow-sm": "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)",
    "--shadow-md": "0 4px 6px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.06)",
    "--shadow-lg": "0 10px 25px rgba(0, 0, 0, 0.12), 0 6px 10px rgba(0, 0, 0, 0.08)",

    // Caret
    "--caret-color": "#0891b2",
  },
};

export const themes: Theme[] = [terminalTheme, cleanTheme, cleanLightTheme];

export const getThemeById = (id: string): Theme => {
  return themes.find((t) => t.id === id) || terminalTheme;
};
