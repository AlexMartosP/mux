import { InputGroup, InputGroupInput } from "@/components/ui/input-group";
import { Button } from "./ui/button";
import { X } from "lucide-react";
import { InputGroupAddon } from "./ui/input-group";

export function Search({
  searchQuery,
  setSearchQuery,
}: {
  searchQuery: string;
  setSearchQuery: (searchQuery: string) => void;
}) {
  return (
    <InputGroup>
      <InputGroupInput
        placeholder="Search agents..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full"
        autoCorrect="off"
      />
      {searchQuery && (
        <InputGroupAddon
          align="inline-end"
        >
          <Button variant="ghost" className="hover:bg-transparent" size="icon" onClick={() => setSearchQuery("")}>

            <X size={16} strokeWidth={1.5} />
          </Button>

        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
