import { PermissionRequest } from "@/domains/tauri/commands";
import { Agent } from "@/types/agent";
import { Button } from "@/components/ui/button";

export function AgentPermissionRequestPopover({ agent, requests, onAllow, onDeny }: { agent: Agent, requests: PermissionRequest[], onAllow: (request: PermissionRequest) => void, onDeny: (request: PermissionRequest) => void }) {
  return (
    <div className="absolute top-0 left-0 -translate-y-[calc(100%+8px)] w-full space-y-2">
      {requests.map((request) => (
        <div key={request.request_id} className="flex justify-between items-center bg-card border border-border rounded-xl p-2">
          <div>
            <p className="text-sm font-semibold text-purple-400 mb-2">Permission requested</p>
            <ToolTitle agent={agent} toolName={request.tool_name} toolInput={request.tool_input} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-success" onClick={() => onAllow(request)}>Allow</Button>
            <Button variant="outline" size="sm" className="text-destructive" onClick={() => onDeny(request)}>Deny</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolTitle({ agent, toolName, toolInput }: { agent: Agent, toolName: string, toolInput: Record<string, unknown> }) {
  function renderSecondaryTitle(): string | undefined {
    switch (toolName) {
      case "Bash":
        return "command" in toolInput ? toolInput.command as string : undefined
      case "Write":
        return parseFilePath(toolInput, agent.worktree_path)
      case "Edit":
        return parseFilePath(toolInput, agent.worktree_path)
    }
  }


  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium">{toolName} <span className="font-semibold">{renderSecondaryTitle()}</span></span>
    </div>
  );
}

function parseFilePath(toolInput: Record<string, unknown>, worktreePath: string): string | undefined {
  const filePath = "file_path" in toolInput ? toolInput.file_path as string : undefined
  if (!filePath) return undefined

  const relativePath = filePath.split(worktreePath + "/")[1]

  if (!relativePath) return undefined

  return relativePath

}
