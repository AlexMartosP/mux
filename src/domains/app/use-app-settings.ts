import { useState } from "react";

const SETTINGS_STORAGE_KEY = "mux-app-settings";
const defaultSettings = {
  send_with_enter: false,
};


export function useAppSettings() {
 const [settings, setSettings] = useState<typeof defaultSettings>(() => {
  return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || "{}") as typeof defaultSettings;
 });

  function updateSettings(updatedSettings: Partial<typeof defaultSettings>) {
    setSettings((prev) => {
      const newSettings = { ...prev, ...updatedSettings };
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(newSettings));
      return newSettings as typeof defaultSettings;
    });
  }

  return {
    settings,
    updateSettings,
  };
}
