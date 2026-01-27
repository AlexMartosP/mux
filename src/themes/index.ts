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
    "--text-primary": "#e8e8e8",
    "--text-secondary": "#a8a8a8",
    "--text-dim": "#8a8a8a",

    // Accents — accessible, distinguishable for all color vision types
    // Green: shifted toward blue-green to separate from yellow for deuteranopia
    "--accent-green": "#4ade80",
    // Yellow: warm amber, distinct from green even in protanopia/deuteranopia
    "--accent-yellow": "#facc15",
    // Red: slightly orange-shifted for better deuteranopia visibility
    "--accent-red": "#f87171",
    // Cyan: deeper blue-cyan for better contrast as text and background
    "--accent-cyan": "#06b6d4",
    // Magenta: shifted to a pink-violet for tritanopia separation from blue
    "--accent-magenta": "#c084fc",
    // Orange: distinct warm tone
    "--accent-orange": "#fb923c",

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
    "--caret-color": "#4ade80",
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
    "--text-dim": "#8294ab",

    // Accents — accessible, color-blind friendly
    "--accent-green": "#4ade80",
    "--accent-yellow": "#facc15",
    "--accent-red": "#f87171",
    "--accent-cyan": "#06b6d4",
    "--accent-magenta": "#c084fc",
    "--accent-orange": "#fb923c",

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

    // Text — all pass 4.5:1 on #ffffff and #f8fafc
    "--text-primary": "#0f172a",
    "--text-secondary": "#475569",
    "--text-dim": "#64748b",

    // Accents — darker for light backgrounds, accessible contrast
    "--accent-green": "#16a34a",
    "--accent-yellow": "#a16207",
    "--accent-red": "#dc2626",
    "--accent-cyan": "#0e7490",
    "--accent-magenta": "#7c3aed",
    "--accent-orange": "#c2410c",

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
    "--caret-color": "#0e7490",
  },
};

export const themes: Theme[] = [terminalTheme, cleanTheme, cleanLightTheme];

export const getThemeById = (id: string): Theme => {
  return themes.find((t) => t.id === id) || terminalTheme;
};
