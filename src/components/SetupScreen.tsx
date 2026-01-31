import { useEffect, useState } from "react";
import { X, RotateCcw } from "lucide-react";
import type { SetupStage } from "../types/agent";
import { Button } from "@/components/ui/button";

interface SetupScreenProps {
  agentName: string;
  currentStage: SetupStage;
  repositoryPath?: string;
  branch?: string;
  error?: string | null;
  onCancel?: () => void;
  onRetry?: () => void;
}

const STAGES: { stage: SetupStage; label: string }[] = [
  { stage: "initializing", label: "Initializing agent" },
  { stage: "creating_worktree", label: "Creating worktree" },
  { stage: "generating_metadata", label: "Generating agent info" },
  { stage: "starting_agent", label: "Starting agent" },
];

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function Spinner() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setFrame((f) => (f + 1) % SPINNER_FRAMES.length);
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <span className="text-primary">{SPINNER_FRAMES[frame]}</span>
  );
}

export function SetupScreen({
  agentName,
  currentStage,
  repositoryPath,
  branch,
  error,
  onCancel,
  onRetry,
}: SetupScreenProps) {
  const currentIndex = STAGES.findIndex((s) => s.stage === currentStage);
  const hasError = Boolean(error);

  // Get repo name from path
  const repoName = repositoryPath?.split("/").pop() || "";

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background">
      <div
        className="p-8 max-w-lg w-full mx-4"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: "4px",
        }}
      >
        {/* Header */}
        <div className="text-center mb-8">
          <h2 className="text-xl font-medium text-foreground mb-2">
            {hasError ? "Setup Failed" : "Spawning Agent"}
          </h2>
          {agentName && agentName !== "Loading..." && (
            <p className="text-sm text-muted-foreground">
              {agentName}
            </p>
          )}
        </div>

        {/* Progress Steps */}
        <div
          className="p-6 mb-6"
          style={{
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border-default)",
            borderRadius: "4px",
          }}
        >
          <div className="space-y-4">
            {STAGES.map((stage, index) => {
              const isComplete = !hasError && index < currentIndex;
              const isCurrent = !hasError && index === currentIndex;
              const isPending = !hasError && index > currentIndex;
              const isErrorStep = hasError && index === currentIndex;

              return (
                <div
                  key={stage.stage}
                  className="flex items-center gap-4"
                >
                  {/* Status icon */}
                  <span className="w-5 text-center flex-shrink-0 text-lg">
                    {isComplete && (
                      <span className="text-success">✓</span>
                    )}
                    {isCurrent && <Spinner />}
                    {isPending && (
                      <span className="text-muted-foreground">○</span>
                    )}
                    {isErrorStep && (
                      <span className="text-destructive">✗</span>
                    )}
                  </span>

                  {/* Label */}
                  <span
                    className={`text-sm ${
                      isPending
                        ? "text-muted-foreground"
                        : isCurrent
                        ? "text-foreground font-medium"
                        : isErrorStep
                        ? "text-destructive"
                        : "text-success"
                    }`}
                  >
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Error message */}
          {hasError && (
            <div
              className="mt-4 p-3"
              style={{
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--destructive)",
                borderRadius: "4px",
              }}
            >
              <p className="text-xs text-destructive font-medium mb-1">Error:</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          )}
        </div>

        {/* Repo/Branch info */}
        {(repoName || branch) && (
          <div className="text-center mb-6">
            <p className="text-xs text-muted-foreground">
              {repoName && <span className="text-primary">{repoName}</span>}
              {repoName && branch && <span> • </span>}
              {branch && <span>{branch}</span>}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-center gap-3">
          {hasError ? (
            <>
              {onRetry && (
                <Button variant="default" onClick={onRetry}>
                  <RotateCcw size={14} className="mr-2" />
                  Retry
                </Button>
              )}
              {onCancel && (
                <Button variant="outline" onClick={onCancel}>
                  <X size={14} className="mr-2" />
                  Cancel
                </Button>
              )}
            </>
          ) : (
            onCancel && (
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
