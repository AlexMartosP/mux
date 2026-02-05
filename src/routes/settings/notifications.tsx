import { createFileRoute } from "@tanstack/react-router";
import { useSettingsQuery } from "@/domains/settings/data/settings-queries";
import { useUpdateSettings } from "@/domains/settings/data/settings-mutations";

export const Route = createFileRoute("/settings/notifications")({
  component: NotificationsSettings,
});

function NotificationsSettings() {
  const { data: settings, isLoading } = useSettingsQuery();
  const updateSettings = useUpdateSettings();

  if (isLoading || !settings) {
    return <div className="text-muted-foreground text-xs">Loading...</div>;
  }

  const handleNotifyOnCompletionChange = (checked: boolean) => {
    updateSettings.mutate({ ...settings, notify_on_completion: checked });
  };

  const handleNotifyOnErrorChange = (checked: boolean) => {
    updateSettings.mutate({ ...settings, notify_on_error: checked });
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xs font-medium text-foreground mb-2">NOTIFICATIONS</h2>
        <p className="text-xs text-muted-foreground mb-3">
          Configure when to receive system notifications.
        </p>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.notify_on_completion}
              onChange={(e) => handleNotifyOnCompletionChange(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-xs text-muted-foreground">
              Notify when task completes successfully
            </span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.notify_on_error}
              onChange={(e) => handleNotifyOnErrorChange(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-xs text-muted-foreground">
              Notify when task encounters an error
            </span>
          </label>
        </div>
      </section>

      {updateSettings.isPending && (
        <p className="text-xs text-muted-foreground">Saving...</p>
      )}
    </div>
  );
}
