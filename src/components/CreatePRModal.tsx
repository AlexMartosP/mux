import { useState, useEffect } from "react";
import type { PRPreview } from "../types/agent";
import * as tauri from "../domains/tauri/commands";

interface CreatePRModalProps {
  taskId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (prUrl: string) => void;
}

export function CreatePRModal({ taskId, isOpen, onClose, onSuccess }: CreatePRModalProps) {
  const [preview, setPreview] = useState<PRPreview | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isDraft, setIsDraft] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && taskId) {
      loadPreview();
    }
  }, [isOpen, taskId]);

  const loadPreview = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const previewData = await tauri.getPRPreview(taskId);
      setPreview(previewData);
      setTitle(previewData.title);
      setBody(previewData.body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load PR preview");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setIsCreating(true);
    setError(null);
    try {
      const pr = await tauri.createPullRequest(taskId, title, body, isDraft);
      onSuccess(pr.url);
      onClose();
    } catch (err) {
      console.error("PR creation error:", err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenExisting = () => {
    if (preview?.existing_pr_url) {
      tauri.openPRInBrowser(preview.existing_pr_url);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl max-h-[90vh] overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        {/* Header */}
        <div
          className="px-6 py-4 flex items-center justify-between"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          <h2 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            CREATE PULL REQUEST
          </h2>
          <button
            onClick={onClose}
            className="text-xs transition-colors"
            style={{ color: 'var(--text-dim)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-red)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
          >
            [X]
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-xs" style={{ color: 'var(--text-dim)' }}>
              Loading...
            </div>
          ) : preview?.has_existing_pr ? (
            <div className="text-center py-8">
              <div className="text-2xl mb-4" style={{ color: 'var(--accent-yellow)' }}>[!]</div>
              <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                PR ALREADY EXISTS
              </h3>
              <p className="text-xs mb-6" style={{ color: 'var(--text-dim)' }}>
                A pull request already exists for branch{" "}
                <code
                  className="px-1 py-0.5"
                  style={{
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                  }}
                >
                  {preview.head_branch}
                </code>
              </p>
              <button
                onClick={handleOpenExisting}
                className="px-4 py-2 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: 'transparent',
                  border: '1px solid var(--accent-cyan)',
                  color: 'var(--accent-cyan)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--accent-cyan)';
                  e.currentTarget.style.color = 'var(--bg-primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'transparent';
                  e.currentTarget.style.color = 'var(--accent-cyan)';
                }}
              >
                OPEN EXISTING PR
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {error && (
                <div
                  className="p-3 text-xs"
                  style={{
                    backgroundColor: 'rgba(255, 68, 68, 0.1)',
                    border: '1px solid var(--accent-red)',
                    color: 'var(--accent-red)',
                  }}
                >
                  ERROR: {error}
                </div>
              )}

              {/* Branch info */}
              {preview && (
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-dim)' }}>
                  <code
                    className="px-2 py-1"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    {preview.head_branch}
                  </code>
                  <span>-&gt;</span>
                  <code
                    className="px-2 py-1"
                    style={{
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    {preview.base_branch}
                  </code>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  TITLE
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2 text-xs"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="PR title"
                />
              </div>

              {/* Body */}
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                  DESCRIPTION
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={12}
                  className="w-full px-4 py-2 text-xs resize-none"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                  placeholder="PR description (Markdown supported)"
                />
              </div>

              {/* Commits */}
              {preview && preview.commits.length > 0 && (
                <div>
                  <label className="block text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
                    COMMITS ({preview.commits.length})
                  </label>
                  <div
                    className="max-h-40 overflow-y-auto"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-default)',
                    }}
                  >
                    {preview.commits.map((commit) => (
                      <div
                        key={commit.short_hash}
                        className="px-3 py-2 flex items-center gap-2"
                        style={{ borderBottom: '1px solid var(--border-default)' }}
                      >
                        <code className="text-xs" style={{ color: 'var(--accent-cyan)' }}>
                          {commit.short_hash}
                        </code>
                        <span className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                          {commit.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warning if no commits */}
              {preview && preview.commits.length === 0 && (
                <div
                  className="p-3 text-xs"
                  style={{
                    backgroundColor: 'rgba(255, 255, 0, 0.05)',
                    border: '1px solid var(--accent-yellow)',
                    color: 'var(--accent-yellow)',
                  }}
                >
                  WARNING: No commits found on this branch compared to {preview.base_branch}.
                </div>
              )}

              {/* Options */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={isDraft}
                    onChange={(e) => setIsDraft(e.target.checked)}
                    style={{ accentColor: 'var(--accent-cyan)' }}
                  />
                  <span style={{ color: 'var(--text-secondary)' }}>Create as draft</span>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isLoading && !preview?.has_existing_pr && (
          <div
            className="px-6 py-4 flex justify-end gap-3"
            style={{ borderTop: '1px solid var(--border-default)' }}
          >
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs transition-colors"
              style={{ color: 'var(--text-dim)' }}
              onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-primary)'}
              onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}
            >
              CANCEL
            </button>
            <button
              onClick={handleCreate}
              disabled={isCreating || !title.trim()}
              className="px-4 py-2 text-xs font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'transparent',
                border: '1px solid var(--accent-green)',
                color: 'var(--accent-green)',
              }}
              onMouseEnter={(e) => {
                if (!isCreating && title.trim()) {
                  e.currentTarget.style.backgroundColor = 'var(--accent-green)';
                  e.currentTarget.style.color = 'var(--bg-primary)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--accent-green)';
              }}
            >
              {isCreating ? "CREATING..." : "CREATE PR"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
