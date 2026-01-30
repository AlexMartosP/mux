import { useState, useEffect } from "react";
import type { Agent, FileChange } from "../types/agent";
import * as tauri from "../lib/tauri";
import { Button } from "./Button";

interface HandbackModalProps {
  agent: Agent;
  isOpen: boolean;
  onClose: () => void;
  onHandback: (commitMessage: string, promptForClaude?: string) => Promise<void>;
}

export function HandbackModal({ agent, isOpen, onClose, onHandback }: HandbackModalProps) {
  const [commitMessage, setCommitMessage] = useState("");
  const [promptForClaude, setPromptForClaude] = useState("");
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadChanges();
      setCommitMessage("");
      setPromptForClaude("");
      setError(null);
    }
  }, [isOpen, agent.id]);

  const loadChanges = async () => {
    setIsLoading(true);
    try {
      // Get changes from the repo root (which is now on the agent branch)
      const fileChanges = await tauri.getAgentChanges(agent.id);
      setChanges(fileChanges);
    } catch (err) {
      console.error("Failed to load changes:", err);
      setChanges([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!commitMessage.trim()) {
      setError("Please enter a commit message");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onHandback(commitMessage.trim(), promptForClaude.trim() || undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to hand back to agent");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  // Common input style
  const inputStyle = {
    backgroundColor: "var(--bg-surface)",
    border: "1px solid var(--border-default)",
    borderRadius: "var(--border-radius)",
    color: "var(--text-primary)",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.8)" }}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col"
        style={{
          backgroundColor: "var(--bg-primary)",
          border: "1px solid var(--border-active)",
          borderRadius: "var(--border-radius)",
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--border-default)" }}
        >
          <div>
            <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              HAND BACK TO CLAUDE
            </h2>
            <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
              Commit your changes and resume Claude
            </p>
          </div>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Changes summary */}
          <div>
            <label
              className="block text-xs font-medium mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Changes since takeover
            </label>
            {isLoading ? (
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                Loading changes...
              </p>
            ) : changes.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-dim)" }}>
                No changes detected
              </p>
            ) : (
              <div
                className="p-3 max-h-40 overflow-y-auto"
                style={inputStyle}
              >
                {changes.map((change) => (
                  <div
                    key={change.path}
                    className="flex items-center gap-2 text-xs py-1"
                  >
                    <span
                      style={{
                        color:
                          change.status === "added"
                            ? "var(--accent-green)"
                            : change.status === "deleted"
                            ? "var(--accent-red)"
                            : "var(--accent-yellow)",
                      }}
                    >
                      {change.status === "added"
                        ? "+"
                        : change.status === "deleted"
                        ? "-"
                        : "M"}
                    </span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {change.path}
                    </span>
                    {(change.additions > 0 || change.deletions > 0) && (
                      <span style={{ color: "var(--text-dim)" }}>
                        (+{change.additions} -{change.deletions})
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Commit message */}
          <div>
            <label
              className="block text-xs font-medium mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              COMMIT MESSAGE *
            </label>
            <textarea
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="Describe the changes you made..."
              rows={3}
              className="w-full px-4 py-3 text-sm resize-none"
              style={inputStyle}
            />
            <p className="text-xs mt-1" style={{ color: "var(--text-dim)" }}>
              This will be squashed with the WIP checkpoint commit
            </p>
          </div>

          {/* Message for Claude */}
          <div>
            <label
              className="block text-xs font-medium mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              MESSAGE FOR CLAUDE (optional)
            </label>
            <textarea
              value={promptForClaude}
              onChange={(e) => setPromptForClaude(e.target.value)}
              placeholder="Tell Claude what you changed and what to do next..."
              rows={2}
              className="w-full px-4 py-3 text-sm resize-none"
              style={inputStyle}
            />
          </div>

          {/* Error message */}
          {error && (
            <p className="text-xs" style={{ color: "var(--accent-red)" }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          className="px-6 py-4 flex items-center justify-end gap-3"
          style={{ borderTop: "1px solid var(--border-default)" }}
        >
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            color="green"
            onClick={handleSubmit}
            disabled={isSubmitting || !commitMessage.trim()}
          >
            {isSubmitting ? "Handing back..." : "Commit & hand back"}
          </Button>
        </div>
      </div>
    </div>
  );
}
