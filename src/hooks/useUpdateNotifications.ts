import { useEffect, useRef } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { toast } from "sonner";

const DOWNLOAD_TOAST_ID = "update-download";

export function useUpdateNotifications() {
  const downloadedRef = useRef(0);
  const contentLengthRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    async function checkForUpdates() {
      try {
        const update = await check();

        if (!mounted) return;

        if (update) {
          toast.info(`Version ${update.version} is available`, {
            description: "Click to download and install.",
            duration: Infinity,
            action: {
              label: "Download & Install",
              onClick: async () => {
                try {
                  toast.loading("Starting download...", {
                    id: DOWNLOAD_TOAST_ID,
                  });

                  downloadedRef.current = 0;
                  contentLengthRef.current = 0;

                  await update.downloadAndInstall((event) => {
                    switch (event.event) {
                      case "Started":
                        contentLengthRef.current = event.data.contentLength ?? 0;
                        toast.loading(
                          contentLengthRef.current > 0
                            ? `0% of ${(contentLengthRef.current / 1024 / 1024).toFixed(1)} MB`
                            : "Starting download...",
                          { id: DOWNLOAD_TOAST_ID }
                        );
                        break;
                      case "Progress":
                        downloadedRef.current += event.data.chunkLength;
                        if (contentLengthRef.current > 0) {
                          const percent = Math.round(
                            (downloadedRef.current / contentLengthRef.current) * 100
                          );
                          toast.loading(
                            `${percent}% of ${(contentLengthRef.current / 1024 / 1024).toFixed(1)} MB`,
                            { id: DOWNLOAD_TOAST_ID }
                          );
                        }
                        break;
                      case "Finished":
                        toast.loading("Installing update...", {
                          id: DOWNLOAD_TOAST_ID,
                        });
                        break;
                    }
                  });

                  toast.success("Update ready", {
                    id: DOWNLOAD_TOAST_ID,
                    description: "The app will restart to apply the update.",
                    duration: 3000,
                  });

                  setTimeout(async () => {
                    try {
                      await relaunch();
                    } catch (relaunchErr) {
                      console.error("Relaunch failed:", relaunchErr);
                      toast.warning("Restart required", {
                        description: "Please restart the app manually to apply the update.",
                        duration: Infinity,
                      });
                    }
                  }, 2000);
                } catch (err) {
                  console.error("Update failed:", err);

                  const errorMessage = err instanceof Error ? err.message : String(err);
                  let userMessage = errorMessage;

                  if (errorMessage.includes("signature")) {
                    userMessage = "Signature verification failed. The update may be corrupted.";
                  } else if (
                    errorMessage.includes("permission") ||
                    errorMessage.includes("EPERM") ||
                    errorMessage.includes("EACCES")
                  ) {
                    userMessage = "Permission denied. Try moving the app to /Applications.";
                  } else if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
                    userMessage = "Network error. Check your internet connection.";
                  }

                  toast.error("Update failed", {
                    id: DOWNLOAD_TOAST_ID,
                    description: userMessage,
                    duration: Infinity,
                  });
                }
              },
            },
          });
        }
      } catch (err) {
        console.error("Failed to check for updates:", err);
      }
    }

    const timeoutId = setTimeout(checkForUpdates, 3000);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, []);
}
