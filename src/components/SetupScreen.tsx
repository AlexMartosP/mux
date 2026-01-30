import { useEffect, useState } from "react";
import type { SetupStage } from "../types/agent";

interface SetupScreenProps {
  agentName: string;
  currentStage: SetupStage;
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
    <span style={{ color: "var(--accent-cyan)" }}>{SPINNER_FRAMES[frame]}</span>
  );
}

export function SetupScreen({ agentName, currentStage }: SetupScreenProps) {
  const currentIndex = STAGES.findIndex((s) => s.stage === currentStage);

  return (
    <div
      className="flex flex-col items-center justify-center h-full"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <div
        className="p-8 max-w-md w-full"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
        }}
      >
        <h2
          className="text-lg font-medium mb-6 text-center"
          style={{ color: "var(--text-primary)" }}
        >
          Setting up agent
        </h2>

        {agentName && agentName !== "Loading..." && (
          <p
            className="text-sm mb-6 text-center"
            style={{ color: "var(--text-secondary)" }}
          >
            {agentName}
          </p>
        )}

        <div className="space-y-3">
          {STAGES.map((stage, index) => {
            const isComplete = index < currentIndex;
            const isCurrent = index === currentIndex;
            const isPending = index > currentIndex;

            return (
              <div
                key={stage.stage}
                className="flex items-center gap-3"
                style={{
                  color: isPending
                    ? "var(--text-dim)"
                    : isCurrent
                    ? "var(--text-primary)"
                    : "var(--accent-green)",
                }}
              >
                <span className="w-4 text-center flex-shrink-0">
                  {isComplete && (
                    <span style={{ color: "var(--accent-green)" }}>✓</span>
                  )}
                  {isCurrent && <Spinner />}
                  {isPending && (
                    <span style={{ color: "var(--text-dim)" }}>○</span>
                  )}
                </span>
                <span className="text-sm">{stage.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
