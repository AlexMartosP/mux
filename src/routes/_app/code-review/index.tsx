import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GitPullRequest, Loader2, AlertCircle } from "lucide-react";
import * as tauri from "@/domains/tauri/commands";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/code-review/")({
  component: CodeReviewPage,
});

interface PullRequest {
  number: number;
  title: string;
  url: string;
  state: string;
  author: string;
  repository: string;
  created_at: string;
  updated_at: string;
  draft: boolean;
}

function CodeReviewPage() {
  const { selectedWorkspaceId } = useWorkspace();
  const [selectedPR, setSelectedPR] = useState<PullRequest | null>(null);

  // Fetch PRs for the selected workspace
  const { data: myPRs = [], isLoading: loadingMyPRs, error: myPRsError } = useQuery({
    queryKey: ["pull-requests", "mine", selectedWorkspaceId],
    queryFn: async () => {
      if (!selectedWorkspaceId) return [];
      console.log("Fetching my PRs for workspace:", selectedWorkspaceId);
      try {
        const result = await tauri.getMyPullRequests(selectedWorkspaceId);
        console.log("My PRs result:", result);
        return result;
      } catch (err) {
        console.error("Failed to fetch my PRs:", err);
        throw err;
      }
    },
    enabled: !!selectedWorkspaceId,
  });

  const { data: reviewPRs = [], isLoading: loadingReviewPRs, error: reviewPRsError } = useQuery({
    queryKey: ["pull-requests", "review", selectedWorkspaceId],
    queryFn: async () => {
      if (!selectedWorkspaceId) return [];
      console.log("Fetching review requests for workspace:", selectedWorkspaceId);
      try {
        const result = await tauri.getReviewRequests(selectedWorkspaceId);
        console.log("Review requests result:", result);
        return result;
      } catch (err) {
        console.error("Failed to fetch review requests:", err);
        throw err;
      }
    },
    enabled: !!selectedWorkspaceId,
  });

  if (!selectedWorkspaceId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Please select a workspace to view pull requests
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* PR Sidebar */}
      <div className="w-80 border-r border-border bg-card flex flex-col h-full">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-medium text-foreground">Pull Requests</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* My PRs Section */}
          <div className="p-3">
            <h3 className="text-xs font-medium text-muted-foreground mb-2 px-2">
              MY PULL REQUESTS
            </h3>
            {loadingMyPRs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : myPRsError ? (
              <p className="text-xs text-destructive px-2 py-4">
                Error: {myPRsError instanceof Error ? myPRsError.message : "Failed to load PRs"}
              </p>
            ) : myPRs.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-4">
                No open pull requests
              </p>
            ) : (
              <div className="space-y-1">
                {myPRs.map((pr) => (
                  <PRListItem
                    key={pr.number}
                    pr={pr}
                    isSelected={selectedPR?.number === pr.number}
                    onClick={() => setSelectedPR(pr)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Review Requests Section */}
          <div className="p-3 border-t border-border">
            <h3 className="text-xs font-medium text-muted-foreground mb-2 px-2">
              TO REVIEW
            </h3>
            {loadingReviewPRs ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              </div>
            ) : reviewPRsError ? (
              <p className="text-xs text-destructive px-2 py-4">
                Error: {reviewPRsError instanceof Error ? reviewPRsError.message : "Failed to load review requests"}
              </p>
            ) : reviewPRs.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-4">
                No review requests
              </p>
            ) : (
              <div className="space-y-1">
                {reviewPRs.map((pr) => (
                  <PRListItem
                    key={pr.number}
                    pr={pr}
                    isSelected={selectedPR?.number === pr.number}
                    onClick={() => setSelectedPR(pr)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center bg-background">
        {selectedPR ? (
          <PRDetailView pr={selectedPR} />
        ) : (
          <div className="text-center space-y-3">
            <GitPullRequest className="w-12 h-12 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Select a pull request to view details
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PRListItem({
  pr,
  isSelected,
  onClick,
}: {
  pr: PullRequest;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-2 rounded transition-colors",
        isSelected
          ? "bg-primary/10 border border-primary"
          : "hover:bg-muted border border-transparent"
      )}
    >
      <div className="flex items-start gap-2">
        <GitPullRequest
          className={cn(
            "w-4 h-4 mt-0.5 flex-shrink-0",
            pr.draft ? "text-muted-foreground" : "text-success"
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">
            {pr.title}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            #{pr.number} • {pr.repository}
          </p>
          {pr.draft && (
            <span className="inline-block text-xs text-muted-foreground mt-1">
              Draft
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function PRDetailView({ pr }: { pr: PullRequest }) {
  return (
    <div className="max-w-4xl w-full p-6 space-y-4">
      <div>
        <div className="flex items-start justify-between mb-2">
          <h1 className="text-lg font-medium text-foreground">{pr.title}</h1>
          <span
            className={cn(
              "text-xs px-2 py-1 rounded",
              pr.state === "open"
                ? "bg-success/10 text-success"
                : "bg-muted text-muted-foreground"
            )}
          >
            {pr.state}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          #{pr.number} opened by {pr.author} in {pr.repository}
        </p>
      </div>

      <div className="p-4 bg-card border border-border rounded-lg">
        <p className="text-xs text-muted-foreground mb-4">
          View this pull request on GitHub to see the full details, diff, and conversation.
        </p>
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          onClick={(e) => {
            e.preventDefault();
            tauri.openPRInBrowser(pr.url);
          }}
        >
          Open in GitHub →
        </a>
      </div>
    </div>
  );
}
