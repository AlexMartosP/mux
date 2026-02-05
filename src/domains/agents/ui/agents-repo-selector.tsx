import { ComboboxPopover } from "@/components/combobox-popover";
import { useSelectedWorkspaceId } from "@/contexts/WorkspaceContext";
import { useWorkspaceRepositoriesQuery } from "@/domains/workspaces/data/workspaces-queries";

export function AgentsRepoSelector({
  selectedRepo,
  onSelectRepo,
}: {
  selectedRepo: string;
  onSelectRepo: (repo: string) => void;
}) {
  const workspaceId = useSelectedWorkspaceId();
  const repositoriesQuery = useWorkspaceRepositoriesQuery(workspaceId);

  return (
    <ComboboxPopover items={repositoriesQuery.data?.map((repository) => ({ label: repository.name, value: repository.repository_path })) ?? []} value={selectedRepo} onChange={onSelectRepo} className="w-full" />
  );
}
