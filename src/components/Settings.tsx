import { useState, useEffect } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as tauri from "../lib/tauri";
import type { AppSettings, ExportOptions } from "../lib/tauri";
import { useUpdater } from "../hooks/useUpdater";
import { useTheme } from "../contexts/ThemeContext";
import { Button } from "@/components/ui/button";

interface SettingsProps {
  onClose: () => void;
  onRestartOnboarding?: () => void;
}

export function Settings({ onClose, onRestartOnboarding }: SettingsProps) {
  const [settings, setSettings] = useState<AppSettings>({
    base_repo_directory: null,
    branch_prefix: null,
    notify_on_completion: true,
    notify_on_error: true,
    prompt_for_permissions: false,
    theme: "terminal",
    max_concurrent_agents: 0,
    send_with_enter: false,
    font_size: 1.0,
  });

  // Theme context
  const { fontSize, setFontSize } = useTheme();
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Export state
  const [exportFormat, setExportFormat] = useState<"json" | "csv" | "markdown">("json");
  const [includeOutput, setIncludeOutput] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // Bug report state
  const [isSubmittingBug, setIsSubmittingBug] = useState(false);

  // Updater
  const {
    checking,
    downloading,
    updateAvailable,
    downloadProgress,
    error: updateError,
    checkForUpdates,
    downloadAndInstall,
  } = useUpdater();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const loaded = await tauri.getSettings();
      setSettings(loaded);
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await tauri.updateSettings(settings);
      setSaveMessage("Settings saved");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      console.error("Failed to save settings:", err);
      setSaveMessage("Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitBug = async () => {
    setIsSubmittingBug(true);
    try {
      await openUrl("https://github.com/users/AlexMartosP/projects/9");
    } catch (err) {
      console.error("Failed to open bug report:", err);
    } finally {
      setIsSubmittingBug(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportMessage(null);
    try {
      const options: ExportOptions = {
        format: exportFormat,
        agent_ids: [], // Export all tasks
        include_output: includeOutput,
      };

      const content = await tauri.exportAgents(options);

      // Get file extension based on format
      const extensions: Record<string, string[]> = {
        json: ["json"],
        csv: ["csv"],
        markdown: ["md"],
      };

      const filePath = await save({
        filters: [{
          name: exportFormat.toUpperCase(),
          extensions: extensions[exportFormat],
        }],
        defaultPath: `mux-export-${new Date().toISOString().split('T')[0]}.${extensions[exportFormat][0]}`,
      });

      if (filePath) {
        // Write the content using Tauri fs plugin
        const { writeTextFile } = await import("@tauri-apps/plugin-fs");
        await writeTextFile(filePath, content);
        setExportMessage(`Exported to ${filePath.split('/').pop()}`);
        setTimeout(() => setExportMessage(null), 3000);
      }
    } catch (err) {
      console.error("Failed to export:", err);
      setExportMessage("Export failed");
    } finally {
      setIsExporting(false);
    }
  };

  // Common input style
  const inputStyle = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--border-radius)',
    color: 'var(--text-primary)',
  };

  return (
    <div className="flex-1 flex flex-col" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <header className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-default)' }}>
        <div>
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>USER SETTINGS</h2>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            Configure global app preferences
          </p>
        </div>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-xl space-y-6">
          {/* Notifications */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              NOTIFICATIONS
            </label>
            <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
              Configure when to receive system notifications.
            </p>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.notify_on_completion}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, notify_on_completion: e.target.checked }))
                  }
                  className="w-4 h-4 accent-cyan-500"
                  style={{ accentColor: 'var(--accent-cyan)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Notify when task completes successfully
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.notify_on_error}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, notify_on_error: e.target.checked }))
                  }
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--accent-cyan)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Notify when task encounters an error
                </span>
              </label>
            </div>
          </div>

          {/* Accessibility */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              ACCESSIBILITY
            </label>
            <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
              Adjust the interface for better readability.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                  Font Size
                </label>
                <div className="flex items-center gap-3">
                  {[
                    { value: 0.85, label: "Small" },
                    { value: 1.0, label: "Default" },
                    { value: 1.15, label: "Large" },
                    { value: 1.3, label: "Extra Large" },
                  ].map((option) => (
                    <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="fontSize"
                        checked={fontSize === option.value}
                        onChange={() => {
                          setFontSize(option.value);
                          setSettings((prev) => ({ ...prev, font_size: option.value }));
                        }}
                        style={{ accentColor: 'var(--accent-cyan)' }}
                      />
                      <span
                        className="text-xs"
                        style={{
                          color: fontSize === option.value ? 'var(--text-primary)' : 'var(--text-secondary)',
                          fontSize: `${option.value * 12}px`
                        }}
                      >
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Send Key */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              SEND KEY
            </label>
            <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
              Choose the keyboard shortcut to send messages.
            </p>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="sendKey"
                  checked={!settings.send_with_enter}
                  onChange={() => setSettings((prev) => ({ ...prev, send_with_enter: false }))}
                  style={{ accentColor: 'var(--accent-cyan)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--text-primary)' }}>⌘+Enter</span> to send (Enter for new line)
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="sendKey"
                  checked={settings.send_with_enter}
                  onChange={() => setSettings((prev) => ({ ...prev, send_with_enter: true }))}
                  style={{ accentColor: 'var(--accent-cyan)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span style={{ color: 'var(--text-primary)' }}>Enter</span> to send (Shift+Enter for new line)
                </span>
              </label>
            </div>
          </div>

          {/* Permissions */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              PERMISSIONS
            </label>
            <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
              Control how Claude handles permission requests for file changes and commands.
            </p>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.prompt_for_permissions}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, prompt_for_permissions: e.target.checked }))
                  }
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--accent-cyan)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Prompt for permissions (requires hook setup)
                </span>
              </label>
            </div>
            {settings.prompt_for_permissions && (
              <div
                className="mt-3 p-3 text-xs"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--accent-yellow)',
                  borderRadius: 'var(--border-radius)',
                  color: 'var(--text-dim)',
                }}
              >
                <p style={{ color: 'var(--accent-yellow)' }}>Setup required:</p>
                <p className="mt-2">Add to ~/.claude/settings.json:</p>
                <pre
                  className="mt-2 p-2 overflow-x-auto"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--border-radius)',
                  }}
                >
{`{
  "hooks": {
    "PermissionRequest": [{
      "matcher": "*",
      "hooks": [{
        "type": "command",
        "command": "node /path/to/agent-coordinator/scripts/permission-hook.cjs"
      }]
    }]
  }
}`}
                </pre>
              </div>
            )}
          </div>

          {/* Concurrency */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              CONCURRENCY
            </label>
            <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
              Maximum number of tasks that can run simultaneously. Set to 0 for unlimited.
            </p>
            <input
              type="number"
              min={0}
              max={20}
              value={settings.max_concurrent_agents}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, max_concurrent_agents: parseInt(e.target.value) || 0 }))
              }
              className="w-24 px-4 py-2 text-xs"
              style={inputStyle}
            />
          </div>

          {/* Updates */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              UPDATES
            </label>
            <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
              Check for and install new versions of Mux.
            </p>
            <div className="flex items-center gap-3">
              {!updateAvailable ? (
                <Button variant="outline" onClick={checkForUpdates} disabled={checking}>
                  {checking ? "Checking..." : "Check for updates"}
                </Button>
              ) : (
                <Button variant="default" onClick={downloadAndInstall} disabled={downloading}>
                  {downloading ? `Downloading ${downloadProgress}%` : `Update to ${updateAvailable.version}`}
                </Button>
              )}
              {updateAvailable && (
                <span className="text-xs" style={{ color: 'var(--accent-green)' }}>
                  New version available: {updateAvailable.version}
                </span>
              )}
              {updateError && (
                <span className="text-xs" style={{ color: 'var(--accent-red)' }}>
                  {updateError}
                </span>
              )}
            </div>
            {updateAvailable?.body && (
              <div
                className="mt-3 p-3 text-xs"
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--border-radius)',
                  color: 'var(--text-dim)',
                }}
              >
                <p style={{ color: 'var(--text-secondary)' }}>Release notes:</p>
                <p className="mt-1 whitespace-pre-wrap">{updateAvailable.body}</p>
              </div>
            )}
          </div>

          {/* Export */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              EXPORT DATA
            </label>
            <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
              Export task history for backup, reporting, or sharing.
            </p>

            <div className="space-y-3">
              {/* Format selection */}
              <div className="flex items-center gap-4">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Format:</span>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="exportFormat"
                    value="json"
                    checked={exportFormat === "json"}
                    onChange={() => setExportFormat("json")}
                    style={{ accentColor: 'var(--accent-cyan)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>JSON</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="exportFormat"
                    value="csv"
                    checked={exportFormat === "csv"}
                    onChange={() => setExportFormat("csv")}
                    style={{ accentColor: 'var(--accent-cyan)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>CSV</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="exportFormat"
                    value="markdown"
                    checked={exportFormat === "markdown"}
                    onChange={() => setExportFormat("markdown")}
                    style={{ accentColor: 'var(--accent-cyan)' }}
                  />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Markdown</span>
                </label>
              </div>

              {/* Include output option */}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeOutput}
                  onChange={(e) => setIncludeOutput(e.target.checked)}
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--accent-cyan)' }}
                />
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Include full task output (larger file size)
                </span>
              </label>

              {/* Export button */}
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={handleExport} disabled={isExporting}>
                  {isExporting ? "Exporting..." : "Export all tasks"}
                </Button>
                {exportMessage && (
                  <span
                    className="text-xs"
                    style={{ color: exportMessage.includes("failed") ? 'var(--accent-red)' : 'var(--accent-green)' }}
                  >
                    {exportMessage}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center gap-3 pt-4" style={{ borderTop: '1px solid var(--border-default)' }}>
            <Button variant="default" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save settings"}
            </Button>
            {saveMessage && (
              <span
                className="text-xs"
                style={{ color: saveMessage === "Settings saved" ? 'var(--accent-green)' : 'var(--accent-red)' }}
              >
                {saveMessage}
              </span>
            )}
          </div>

          {/* Bug Report */}
          <div>
            <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
              REPORT A BUG
            </label>
            <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
              Found an issue? Let us know and we'll fix it.
            </p>
            <Button variant="outline" onClick={handleSubmitBug} disabled={isSubmittingBug}>
              {isSubmittingBug ? "Opening..." : "Report bug"}
            </Button>
          </div>

          {/* Re-run Onboarding */}
          {onRestartOnboarding && (
            <div className="pt-6 mt-6" style={{ borderTop: '1px solid var(--border-default)' }}>
              <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                ONBOARDING
              </label>
              <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
                Re-run the setup wizard to reconfigure Mux.
              </p>
              <Button
                variant="outline"
                onClick={async () => {
                  await tauri.resetOnboarding();
                  onRestartOnboarding();
                }}
              >
                Restart onboarding
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
