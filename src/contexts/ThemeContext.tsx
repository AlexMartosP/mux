import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { themes, getThemeById, Theme } from "../themes";
import * as tauri from "../lib/tauri";

interface ThemeContextValue {
  theme: Theme;
  setThemeId: (id: string) => void;
  themes: Theme[];
  fontSize: number;
  setFontSize: (size: number) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getThemeById("terminal"));
  const [fontSize, setFontSizeState] = useState<number>(1.0);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load theme and font size from settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await tauri.getSettings();
        if (settings.theme) {
          setTheme(getThemeById(settings.theme));
        }
        if (settings.font_size) {
          setFontSizeState(settings.font_size);
        }
      } catch (err) {
        console.error("Failed to load settings:", err);
      } finally {
        setIsLoaded(true);
      }
    };
    loadSettings();
  }, []);

  // Apply theme variables to document
  useEffect(() => {
    const root = document.documentElement;

    // Apply all theme variables
    Object.entries(theme.variables).forEach(([key, value]) => {
      root.style.setProperty(key, value);
    });

    // Apply font-family to body
    document.body.style.fontFamily = theme.variables["--font-family"];

    // Apply font size multiplier
    root.style.setProperty("--font-size-multiplier", String(fontSize));
    root.style.fontSize = `${fontSize * 100}%`;

    // Update theme-specific styles
    let styleElement = document.getElementById("theme-styles");
    if (!styleElement) {
      styleElement = document.createElement("style");
      styleElement.id = "theme-styles";
      document.head.appendChild(styleElement);
    }

    if (theme.id === "terminal") {
      // Terminal theme: minimal styling, let inline styles control border-radius
      styleElement.textContent = ``;
    } else {
      // Clean themes: rounded corners, shadows, softer appearance
      styleElement.textContent = `
        /* Buttons */
        button {
          border-radius: var(--border-radius) !important;
        }

        /* Inputs */
        input, textarea, select {
          border-radius: var(--border-radius-sm) !important;
        }

        /* Cards and panels */
        aside, .panel, [class*="surface"] {
          border-radius: var(--border-radius-lg) !important;
        }

        /* Dropdowns */
        [class*="dropdown"], [class*="menu"] {
          border-radius: var(--border-radius) !important;
          box-shadow: var(--shadow-lg) !important;
        }

        /* Task items */
        .task-item {
          border-radius: var(--border-radius) !important;
          box-shadow: var(--shadow-sm);
        }

        /* Modals and elevated content */
        [class*="modal"], [class*="dialog"], [class*="popover"] {
          border-radius: var(--border-radius-lg) !important;
          box-shadow: var(--shadow-lg) !important;
        }

        /* Sidebar */
        aside {
          box-shadow: var(--shadow-md);
        }

        /* Scrollbar for clean themes */
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        ::-webkit-scrollbar-track {
          background: transparent;
        }
        ::-webkit-scrollbar-thumb {
          background: var(--border-active);
          border-radius: 4px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: var(--border-active);
        }
      `;
    }
  }, [theme, fontSize]);

  const setThemeId = async (id: string) => {
    const newTheme = getThemeById(id);
    setTheme(newTheme);

    // Save to settings
    try {
      await tauri.setSetting("theme", id);
    } catch (err) {
      console.error("Failed to save theme setting:", err);
    }
  };

  const setFontSize = async (size: number) => {
    setFontSizeState(size);

    // Save to settings
    try {
      await tauri.setSetting("font_size", String(size));
    } catch (err) {
      console.error("Failed to save font size setting:", err);
    }
  };

  // Don't render until theme is loaded to prevent flash
  if (!isLoaded) {
    return null;
  }

  return (
    <ThemeContext.Provider value={{ theme, setThemeId, themes, fontSize, setFontSize }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
