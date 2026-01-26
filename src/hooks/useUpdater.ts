import { useState, useCallback } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

interface UpdateInfo {
  version: string;
  body?: string;
  date?: string;
}

export function useUpdater() {
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    setError(null);

    try {
      const update = await check();

      if (update) {
        setUpdateAvailable({
          version: update.version,
          body: update.body,
          date: update.date,
        });
        return update;
      } else {
        setUpdateAvailable(null);
        return null;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to check for updates";
      setError(message);
      console.error("Update check failed:", err);
      return null;
    } finally {
      setChecking(false);
    }
  }, []);

  const downloadAndInstall = useCallback(async () => {
    setDownloading(true);
    setDownloadProgress(0);
    setError(null);

    try {
      const update = await check();

      if (!update) {
        setError("No update available");
        return false;
      }

      let downloaded = 0;
      let contentLength = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength || 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setDownloadProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case "Finished":
            setDownloadProgress(100);
            break;
        }
      });

      // Relaunch the app to apply the update
      await relaunch();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to download update";
      setError(message);
      console.error("Update download failed:", err);
      return false;
    } finally {
      setDownloading(false);
    }
  }, []);

  return {
    checking,
    downloading,
    updateAvailable,
    downloadProgress,
    error,
    checkForUpdates,
    downloadAndInstall,
  };
}
