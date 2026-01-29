import { useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { useToast } from "../contexts/ToastContext";

export function useUpdateNotifications() {
  const { addToast, removeToast } = useToast();
  const downloadToastId = useRef<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkForUpdates() {
      try {
        const update = await check();

        if (!mounted) return;

        if (update) {
          addToast({
            type: "info",
            title: "Update Available",
            message: `Version ${update.version} is available. Click to download.`,
            duration: 0, // Don't auto-dismiss
            action: {
              label: "Download & Install",
              onClick: async () => {
                try {
                  // Show downloading toast
                  const toastId = crypto.randomUUID();
                  downloadToastId.current = toastId;
                  addToast({
                    id: toastId,
                    type: "info",
                    title: "Downloading Update",
                    message: "Starting download...",
                    duration: 0,
                  });

                  let downloaded = 0;
                  let contentLength = 0;

                  // Download and install with progress tracking
                  await update.downloadAndInstall((event) => {
                    switch (event.event) {
                      case "Started":
                        contentLength = event.data.contentLength ?? 0;
                        if (downloadToastId.current) {
                          removeToast(downloadToastId.current);
                        }
                        const newToastId = crypto.randomUUID();
                        downloadToastId.current = newToastId;
                        addToast({
                          id: newToastId,
                          type: "info",
                          title: "Downloading Update",
                          message: contentLength > 0
                            ? `0% of ${(contentLength / 1024 / 1024).toFixed(1)} MB`
                            : "Starting download...",
                          duration: 0,
                        });
                        break;
                      case "Progress":
                        downloaded += event.data.chunkLength;
                        if (contentLength > 0 && downloadToastId.current) {
                          const percent = Math.round((downloaded / contentLength) * 100);
                          removeToast(downloadToastId.current);
                          const progressToastId = crypto.randomUUID();
                          downloadToastId.current = progressToastId;
                          addToast({
                            id: progressToastId,
                            type: "info",
                            title: "Downloading Update",
                            message: `${percent}% of ${(contentLength / 1024 / 1024).toFixed(1)} MB`,
                            duration: 0,
                          });
                        }
                        break;
                      case "Finished":
                        if (downloadToastId.current) {
                          removeToast(downloadToastId.current);
                        }
                        addToast({
                          type: "info",
                          title: "Installing Update",
                          message: "Please wait...",
                          duration: 0,
                        });
                        break;
                    }
                  });

                  addToast({
                    type: "success",
                    title: "Update Ready",
                    message: "The app will restart to apply the update.",
                    duration: 3000,
                  });

                  // Give user time to see the message
                  setTimeout(async () => {
                    try {
                      await relaunch();
                    } catch (relaunchErr) {
                      console.error("Relaunch failed:", relaunchErr);
                      addToast({
                        type: "warning",
                        title: "Restart Required",
                        message: "Please restart the app manually to apply the update.",
                        duration: 0,
                      });
                    }
                  }, 2000);
                } catch (err) {
                  console.error("Update failed:", err);
                  if (downloadToastId.current) {
                    removeToast(downloadToastId.current);
                  }

                  // Parse error for common issues
                  const errorMessage = err instanceof Error ? err.message : String(err);
                  let userMessage = errorMessage;

                  if (errorMessage.includes("signature")) {
                    userMessage = "Signature verification failed. The update may be corrupted.";
                  } else if (errorMessage.includes("permission") || errorMessage.includes("EPERM") || errorMessage.includes("EACCES")) {
                    userMessage = "Permission denied. Try moving the app to /Applications.";
                  } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
                    userMessage = "Network error. Check your internet connection.";
                  }

                  addToast({
                    type: "error",
                    title: "Update Failed",
                    message: userMessage,
                    duration: 0, // Don't auto-dismiss errors
                  });
                }
              },
            },
          });
        }
      } catch (err) {
        // Silently fail - update checks failing shouldn't interrupt the user
        console.error("Failed to check for updates:", err);
      }
    }

    // Check for updates on mount (with a small delay to not block app startup)
    const timeoutId = setTimeout(checkForUpdates, 3000);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [addToast, removeToast]);
}
