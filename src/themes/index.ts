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
    "--accent-green": "#4ade80",
    "--accent-yellow": "#facc15",
    "--accent-red": "#f87171",
    "--accent-cyan": "#06b6d4",
    "--accent-magenta": "#c084fc",
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

export const themes: Theme[] = [terminalTheme];

export const getThemeById = (id: string): Theme => {
  return themes.find((t) => t.id === id) || terminalTheme;
};
