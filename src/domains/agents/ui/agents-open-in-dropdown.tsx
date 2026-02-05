import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FolderOpen } from "lucide-react";
import * as tauri from "@/domains/tauri/commands";
import { toast } from "sonner";

const EDITORS: { name: string; value: "vscode" | "cursor" }[] = [
  {
    name: "VS Code",
    value: "vscode",
  },
  {
    name: "Cursor",
    value: "cursor",
  },
]

export function AgentsOpenInDropdown({
  path
}: {
  path: string;
}) {
  async function openInEditor(editor: "vscode" | "cursor") {
    try {
      await tauri.openInEditor(path, editor);
    } catch (err) {
      console.error(`Failed to open in ${editor}:`, err);
      toast.error(`Failed to open in ${editor}. Please try again.`);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <Button variant="ghost" title="Open in editor">
          <FolderOpen size={16} strokeWidth={1.5} data-icon="inline-start" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {EDITORS.map((editor) => (
          <DropdownMenuItem key={editor.value} onClick={() => openInEditor(editor.value)}>
            {editor.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
