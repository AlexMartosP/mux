import { useState, useMemo } from "react";
import { ComboboxPopover } from "@/components/combobox-popover";
import { useSelectedWorkspaceId } from "@/contexts/WorkspaceContext";
import { useWorkspaceRepositoriesQuery } from "@/domains/workspaces/data/workspaces-queries";
import { useRecentItems } from "@/hooks/useRecentItems";

type RepoItem = { label: string; value: string };

export function AgentsRepoSelector({
  selectedRepo,
  onSelectRepo,
}: {
  selectedRepo: string;
  onSelectRepo: (repo: string) => void;
}) {
  const workspaceId = useSelectedWorkspaceId();
  const repositoriesQuery = useWorkspaceRepositoriesQuery(workspaceId);
  const { recentItems, addRecentItem } = useRecentItems<string>("mux-recent-repos", 5);
  const [searchValue, setSearchValue] = useState("");

  // Build items based on search state
  const items = useMemo(() => {
    // Map repositories to items
    const allRepos: RepoItem[] = repositoriesQuery.data?.map((repository) => ({
      label: repository.name,
      value: repository.repository_path,
    })) ?? [];

    // When not searching, show sections
    if (searchValue === "") {
      // Build recent repos (filter to only those that exist in allRepos)
      const recentRepos = recentItems
        .map((repoPath) => allRepos.find((r) => r.value === repoPath))
        .filter((r): r is RepoItem => r !== undefined);

      // Build "All" section (exclude recent repos)
      const recentPaths = new Set(recentRepos.map((r) => r.value));
      const allReposExcludingRecent = allRepos.filter((r) => !recentPaths.has(r.value));

      // Only show sections if we have items
      if (recentRepos.length > 0) {
        return [
          { type: 'section' as const, label: 'Recently used', items: recentRepos },
          { type: 'section' as const, label: 'All', items: allReposExcludingRecent },
        ];
      }

      // No recent items, just show all as a single section
      return [{ type: 'section' as const, label: 'All', items: allRepos }];
    }

    // When searching, filter manually and return flat list
    const searchLower = searchValue.toLowerCase();
    const filteredRepos = allRepos.filter((repo) =>
      repo.label.toLowerCase().includes(searchLower)
    );
    return filteredRepos;
  }, [searchValue, recentItems, repositoriesQuery.data]);

  // Handle selection - add to recent items
  const handleChange = (repoPath: string) => {
    onSelectRepo(repoPath);
    if (repoPath) {
      addRecentItem(repoPath);
    }
  };

  return (
    <ComboboxPopover
      items={items}
      value={selectedRepo}
      onChange={handleChange}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      className="w-full"
    />
  );
}
