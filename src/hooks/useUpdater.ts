import { useState, useCallback, useRef } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
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
  const updateRef = useRef<Update | null>(null);

  const checkForUpdates = useCallback(async () => {
    setChecking(true);
    setError(null);

    try {
      const update = await check();

      if (update) {
        updateRef.current = update;
        setUpdateAvailable({
          version: update.version,
          body: update.body,
          date: update.date,
        });
        return update;
      } else {
        updateRef.current = null;
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
      // Use stored update or check again
      let update = updateRef.current;
      if (!update) {
        update = await check();
        if (update) {
          updateRef.current = update;
        }
      }

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
            console.log("Update download started, size:", contentLength);
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setDownloadProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case "Finished":
            console.log("Update download finished");
            setDownloadProgress(100);
            break;
        }
      });

      console.log("Update installed, relaunching...");
      // Relaunch the app to apply the update
      await relaunch();
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
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
