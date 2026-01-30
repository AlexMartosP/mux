import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import * as tauri from "../lib/tauri";
import { Button } from "./Button";

interface OnboardingProps {
  onComplete: () => void;
}

type Step = "welcome" | "repository" | "permissions" | "branch" | "notifications" | "complete";

const STEPS: Step[] = ["welcome", "repository", "permissions", "branch", "notifications", "complete"];

export function Onboarding({ onComplete }: OnboardingProps) {
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [settings, setSettings] = useState({
    base_repo_directory: "",
    branch_prefix: "",
    notify_on_completion: true,
    notify_on_error: true,
    prompt_for_permissions: true,
  });
  const [hookStatus, setHookStatus] = useState<tauri.ClaudeHookStatus | null>(null);
  const [isInstallingHook, setIsInstallingHook] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    checkHookStatus();
  }, []);

  const checkHookStatus = async () => {
    try {
      const status = await tauri.checkClaudeHookStatus();
      setHookStatus(status);
    } catch (err) {
      console.error("Failed to check hook status:", err);
    }
  };

  const handleInstallHook = async () => {
    setIsInstallingHook(true);
    setHookError(null);
    try {
      await tauri.installClaudeHook();
      await checkHookStatus();
    } catch (err) {
      setHookError(err instanceof Error ? err.message : "Failed to install hook");
    } finally {
      setIsInstallingHook(false);
    }
  };

  const handleBrowseDirectory = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select Base Repository Directory",
      });
      if (selected && typeof selected === "string") {
        setSettings((prev) => ({ ...prev, base_repo_directory: selected }));
      }
    } catch (err) {
      console.error("Failed to open folder picker:", err);
    }
  };

  const handleNext = () => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const currentIndex = STEPS.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(STEPS[currentIndex - 1]);
    }
  };

  const handleFinish = async () => {
    setIsSaving(true);
    try {
      // Save settings
      await tauri.updateSettings({
        base_repo_directory: settings.base_repo_directory || null,
        branch_prefix: settings.branch_prefix || null,
        notify_on_completion: settings.notify_on_completion,
        notify_on_error: settings.notify_on_error,
        prompt_for_permissions: settings.prompt_for_permissions,
        theme: null, // Default theme will be loaded from context
        max_concurrent_agents: 0,
        send_with_enter: false,
        font_size: 1.0,
      });

      // Mark onboarding as complete
      await tauri.completeOnboarding();
      onComplete();
    } catch (err) {
      console.error("Failed to save settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const currentIndex = STEPS.indexOf(currentStep);
  const progress = ((currentIndex) / (STEPS.length - 1)) * 100;

  return (
    <div
      className="h-screen flex flex-col"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      {/* Progress bar */}
      {currentStep !== "welcome" && currentStep !== "complete" && (
        <div
          className="h-1"
          style={{ backgroundColor: 'var(--bg-surface)' }}
        >
          <div
            className="h-full transition-all duration-300"
            style={{
              width: `${progress}%`,
              backgroundColor: 'var(--accent-cyan)',
            }}
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="max-w-lg w-full">
          {currentStep === "welcome" && (
            <WelcomeStep onNext={handleNext} />
          )}

          {currentStep === "repository" && (
            <RepositoryStep
              value={settings.base_repo_directory}
              onBrowse={handleBrowseDirectory}
              onChange={(value) => setSettings((prev) => ({ ...prev, base_repo_directory: value }))}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === "permissions" && (
            <PermissionsStep
              enabled={settings.prompt_for_permissions}
              onToggle={(value) => setSettings((prev) => ({ ...prev, prompt_for_permissions: value }))}
              hookStatus={hookStatus}
              onInstallHook={handleInstallHook}
              isInstalling={isInstallingHook}
              error={hookError}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === "branch" && (
            <BranchStep
              value={settings.branch_prefix}
              onChange={(value) => setSettings((prev) => ({ ...prev, branch_prefix: value }))}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === "notifications" && (
            <NotificationsStep
              notifyOnCompletion={settings.notify_on_completion}
              notifyOnError={settings.notify_on_error}
              onToggleCompletion={(value) => setSettings((prev) => ({ ...prev, notify_on_completion: value }))}
              onToggleError={(value) => setSettings((prev) => ({ ...prev, notify_on_error: value }))}
              onNext={handleNext}
              onBack={handleBack}
            />
          )}

          {currentStep === "complete" && (
            <CompleteStep
              onFinish={handleFinish}
              onBack={handleBack}
              isSaving={isSaving}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Common input style
const inputStyle = {
  backgroundColor: 'var(--bg-surface)',
  border: '1px solid var(--border-default)',
  borderRadius: 'var(--border-radius)',
  color: 'var(--text-primary)',
};

// Welcome Step
function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div className="text-center">
      <div
        className="text-6xl mb-6 font-mono"
        style={{ color: 'var(--accent-cyan)' }}
      >
        MUX
      </div>
      <h1
        className="text-xl font-medium mb-4"
        style={{ color: 'var(--text-primary)' }}
      >
        Welcome to Mux
      </h1>
      <p
        className="text-sm mb-8 leading-relaxed"
        style={{ color: 'var(--text-secondary)' }}
      >
        Mux is a powerful task coordinator for Claude Code that helps you manage
        multiple coding tasks simultaneously. Each task runs in its own git
        worktree, keeping your work isolated and organized.
      </p>
      <div
        className="text-xs mb-8 space-y-2"
        style={{ color: 'var(--text-dim)' }}
      >
        <p>Let's get you set up in a few quick steps.</p>
      </div>
      <Button variant="primary" onClick={onNext}>
        Get started
      </Button>
    </div>
  );
}

// Repository Step
function RepositoryStep({
  value,
  onBrowse,
  onChange,
  onNext,
  onBack,
}: {
  value: string;
  onBrowse: () => void;
  onChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2
        className="text-lg font-medium mb-2"
        style={{ color: 'var(--text-primary)' }}
      >
        Base Repository Directory
      </h2>
      <p
        className="text-xs mb-6"
        style={{ color: 'var(--text-dim)' }}
      >
        Select the directory where your repositories are located. Mux will show
        these as quick-select options when creating new tasks.
      </p>

      <div className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="e.g., ~/projects"
            className="flex-1 px-4 py-3 text-sm"
            style={inputStyle}
          />
          <Button variant="secondary" onClick={onBrowse}>
            Browse
          </Button>
        </div>
        <p
          className="text-xs mt-2"
          style={{ color: 'var(--text-dim)' }}
        >
          You can change this later in Settings.
        </p>
      </div>

      <NavigationButtons onBack={onBack} onNext={onNext} nextLabel="Next" />
    </div>
  );
}

// Permissions Step
function PermissionsStep({
  enabled,
  onToggle,
  hookStatus,
  onInstallHook,
  isInstalling,
  error,
  onNext,
  onBack,
}: {
  enabled: boolean;
  onToggle: (value: boolean) => void;
  hookStatus: tauri.ClaudeHookStatus | null;
  onInstallHook: () => void;
  isInstalling: boolean;
  error: string | null;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2
        className="text-lg font-medium mb-2"
        style={{ color: 'var(--text-primary)' }}
      >
        Permission System
      </h2>
      <p
        className="text-xs mb-6"
        style={{ color: 'var(--text-dim)' }}
      >
        Mux can prompt you for approval before Claude executes certain actions.
        This gives you more control over what Claude does in your repositories.
      </p>

      <div className="mb-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="w-5 h-5 mt-0.5"
            style={{ accentColor: 'var(--accent-cyan)' }}
          />
          <div>
            <span
              className="text-sm block"
              style={{ color: 'var(--text-primary)' }}
            >
              Enable permission prompts
            </span>
            <span
              className="text-xs block mt-1"
              style={{ color: 'var(--text-dim)' }}
            >
              You'll be asked to approve or deny sensitive actions
            </span>
          </div>
        </label>
      </div>

      {enabled && (
        <div
          className="mb-6 p-4"
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--border-radius)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span
              className="text-xs font-medium"
              style={{ color: 'var(--text-primary)' }}
            >
              CLAUDE HOOK STATUS
            </span>
            {hookStatus?.installed ? (
              <span
                className="text-xs px-2 py-1"
                style={{
                  backgroundColor: 'rgba(0, 255, 0, 0.1)',
                  color: 'var(--accent-green)',
                  borderRadius: 'var(--border-radius)',
                }}
              >
                INSTALLED
              </span>
            ) : (
              <span
                className="text-xs px-2 py-1"
                style={{
                  backgroundColor: 'rgba(255, 255, 0, 0.1)',
                  color: 'var(--accent-yellow)',
                  borderRadius: 'var(--border-radius)',
                }}
              >
                NOT INSTALLED
              </span>
            )}
          </div>

          <p
            className="text-xs mb-3"
            style={{ color: 'var(--text-dim)' }}
          >
            To enable permissions, Mux needs to add a hook to your Claude settings.
          </p>

          {hookStatus && !hookStatus.installed && (
            <>
              <div
                className="text-xs mb-3 p-2"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--border-radius)',
                  color: 'var(--text-dim)',
                }}
              >
                <p className="mb-1">This will modify:</p>
                <code style={{ color: 'var(--accent-cyan)' }}>
                  {hookStatus.settings_path}
                </code>
              </div>

              <Button
                variant="primary"
                onClick={onInstallHook}
                disabled={isInstalling}
                className="w-full"
              >
                {isInstalling ? "Installing..." : "Install hook"}
              </Button>
            </>
          )}

          {hookStatus?.installed && (
            <p
              className="text-xs"
              style={{ color: 'var(--accent-green)' }}
            >
              Hook is installed and ready to use.
            </p>
          )}

          {error && (
            <p
              className="text-xs mt-2"
              style={{ color: 'var(--accent-red)' }}
            >
              Error: {error}
            </p>
          )}
        </div>
      )}

      <NavigationButtons onBack={onBack} onNext={onNext} nextLabel="Next" />
    </div>
  );
}

// Branch Step
function BranchStep({
  value,
  onChange,
  onNext,
  onBack,
}: {
  value: string;
  onChange: (value: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2
        className="text-lg font-medium mb-2"
        style={{ color: 'var(--text-primary)' }}
      >
        Branch Prefix
      </h2>
      <p
        className="text-xs mb-6"
        style={{ color: 'var(--text-dim)' }}
      >
        When Mux creates a new task, it generates a branch name automatically.
        You can add a prefix to identify your branches.
      </p>

      <div className="mb-6">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g., john-doe, feature, fix"
          className="w-full px-4 py-3 text-sm"
          style={inputStyle}
        />
        <p
          className="text-xs mt-2"
          style={{ color: 'var(--text-dim)' }}
        >
          Example branch: <code style={{ color: 'var(--accent-cyan)' }}>
            {value ? `${value}&` : ""}task-name-here
          </code>
        </p>
      </div>

      <NavigationButtons onBack={onBack} onNext={onNext} nextLabel="Next" />
    </div>
  );
}

// Notifications Step
function NotificationsStep({
  notifyOnCompletion,
  notifyOnError,
  onToggleCompletion,
  onToggleError,
  onNext,
  onBack,
}: {
  notifyOnCompletion: boolean;
  notifyOnError: boolean;
  onToggleCompletion: (value: boolean) => void;
  onToggleError: (value: boolean) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div>
      <h2
        className="text-lg font-medium mb-2"
        style={{ color: 'var(--text-primary)' }}
      >
        Notifications
      </h2>
      <p
        className="text-xs mb-6"
        style={{ color: 'var(--text-dim)' }}
      >
        Get notified when tasks complete or need your attention.
      </p>

      <div className="space-y-4 mb-6">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={notifyOnCompletion}
            onChange={(e) => onToggleCompletion(e.target.checked)}
            className="w-5 h-5 mt-0.5"
            style={{ accentColor: 'var(--accent-cyan)' }}
          />
          <div>
            <span
              className="text-sm block"
              style={{ color: 'var(--text-primary)' }}
            >
              Task completion
            </span>
            <span
              className="text-xs block mt-1"
              style={{ color: 'var(--text-dim)' }}
            >
              Notify when a task finishes successfully
            </span>
          </div>
        </label>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={notifyOnError}
            onChange={(e) => onToggleError(e.target.checked)}
            className="w-5 h-5 mt-0.5"
            style={{ accentColor: 'var(--accent-cyan)' }}
          />
          <div>
            <span
              className="text-sm block"
              style={{ color: 'var(--text-primary)' }}
            >
              Errors and issues
            </span>
            <span
              className="text-xs block mt-1"
              style={{ color: 'var(--text-dim)' }}
            >
              Notify when a task encounters an error
            </span>
          </div>
        </label>
      </div>

      <NavigationButtons onBack={onBack} onNext={onNext} nextLabel="Next" />
    </div>
  );
}

// Complete Step
function CompleteStep({
  onFinish,
  onBack,
  isSaving,
}: {
  onFinish: () => void;
  onBack: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="text-center">
      <div
        className="text-4xl mb-6"
        style={{ color: 'var(--accent-green)' }}
      >
        ✓
      </div>
      <h2
        className="text-lg font-medium mb-4"
        style={{ color: 'var(--text-primary)' }}
      >
        You're all set!
      </h2>
      <p
        className="text-sm mb-8"
        style={{ color: 'var(--text-secondary)' }}
      >
        Mux is ready to help you manage your Claude Code tasks.
        You can always change these settings later.
      </p>

      <div className="flex justify-center gap-3">
        <Button variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary" onClick={onFinish} disabled={isSaving}>
          {isSaving ? "Saving..." : "Start using Mux"}
        </Button>
      </div>
    </div>
  );
}

// Navigation Buttons
function NavigationButtons({
  onBack,
  onNext,
  nextLabel,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel: string;
}) {
  return (
    <div className="flex justify-between">
      <Button variant="secondary" onClick={onBack}>
        Back
      </Button>
      <Button variant="primary" onClick={onNext}>
        {nextLabel}
      </Button>
    </div>
  );
}
