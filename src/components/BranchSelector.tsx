import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from "react";
import type { BranchInfo } from "../types/agent";

export interface BranchSelectorProps {
  branches: BranchInfo[];
  selectedBranch: string;
  onSelectBranch: (branch: string) => void;
  /** Mode for new branches: "auto" = auto-generated, "custom" = user-specified name */
  newBranchMode?: "auto" | "custom" | null;
  onNewBranchModeChange?: (mode: "auto" | "custom" | null) => void;
  /** Label shown on the trigger button (e.g., "[B]" for branch, "Base:" for base branch) */
  label?: string;
  /** Whether to show new branch creation options */
  showNewBranchOptions?: boolean;
  /** Placeholder for empty state */
  placeholder?: string;
  disabled?: boolean;
}

export interface BranchSelectorRef {
  close: () => void;
}

/**
 * Reusable branch selector dropdown component.
 * Supports selecting existing branches or creating new branches (auto/custom name).
 */
export const BranchSelector = forwardRef<BranchSelectorRef, BranchSelectorProps>(
  function BranchSelector(
    {
      branches,
      selectedBranch,
      onSelectBranch,
      newBranchMode,
      onNewBranchModeChange,
      // customBranchName and onCustomBranchNameChange are used separately with CustomBranchNameInput
      label = "[B]",
      showNewBranchOptions = true,
      placeholder = "Select branch",
      disabled = false,
    },
    ref
  ) {
    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);

    // Expose close method via ref
    useImperativeHandle(ref, () => ({
      close: () => setIsOpen(false),
    }));

    // Close on click outside
    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setIsOpen(false);
          setSearch("");
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const filteredBranches = branches.filter((b) =>
      b.name.toLowerCase().includes(search.toLowerCase())
    );

    const getDisplayText = () => {
      if (selectedBranch) {
        return selectedBranch;
      }
      if (newBranchMode === "custom") {
        return "New branch (custom name)";
      }
      if (newBranchMode === "auto") {
        return "New branch (auto-generated)";
      }
      return placeholder;
    };

    const isSelected = selectedBranch || newBranchMode;

    return (
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          className={`px-3 py-2 text-xs transition-colors flex items-center gap-2 rounded border ${
            isSelected
              ? "border-primary text-foreground"
              : "border-border text-muted-foreground"
          } ${disabled ? "opacity-50 cursor-not-allowed" : "hover:border-input"}`}
        >
          <span className="text-primary">{label}</span>
          <span className="truncate max-w-[200px]">{getDisplayText()}</span>
          <span className="text-muted-foreground">{isOpen ? "▲" : "▼"}</span>
        </button>

        {isOpen && (
          <div className="absolute bottom-full left-0 mb-1 w-80 max-h-60 overflow-hidden flex flex-col z-50 bg-popover border border-input rounded-md">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search branches..."
              className="px-3 py-2 text-xs bg-card border-b border-border text-foreground placeholder:text-muted-foreground focus:outline-none"
              autoFocus
            />
            <div className="overflow-y-auto flex-1">
              {showNewBranchOptions && (
                <>
                  {/* Auto-generate option */}
                  <button
                    type="button"
                    onClick={() => {
                      onSelectBranch("");
                      onNewBranchModeChange?.("auto");
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors border-b border-border ${
                      !selectedBranch && newBranchMode === "auto"
                        ? "bg-muted text-primary"
                        : "hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <span className="text-primary">+</span> New branch (auto-generated)
                  </button>

                  {/* Custom branch name option */}
                  <button
                    type="button"
                    onClick={() => {
                      onSelectBranch("");
                      onNewBranchModeChange?.("custom");
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors border-b border-border ${
                      newBranchMode === "custom"
                        ? "bg-muted text-primary"
                        : "hover:bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    <span className="text-primary">+</span> New branch (custom name)
                  </button>
                </>
              )}

              {filteredBranches.map((branch) => (
                <button
                  type="button"
                  key={branch.name}
                  onClick={() => {
                    onSelectBranch(branch.name);
                    onNewBranchModeChange?.(null);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                    selectedBranch === branch.name
                      ? "bg-muted text-primary"
                      : "hover:bg-muted/50 text-muted-foreground"
                  }`}
                >
                  <span className="truncate flex-1">{branch.name}</span>
                  {branch.is_current && <span className="text-success">*</span>}
                </button>
              ))}
              {filteredBranches.length === 0 && search && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  No matching branches
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

interface CustomBranchNameInputProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Input for custom branch name with validation.
 * Automatically formats input to valid branch name format.
 */
export function CustomBranchNameInput({ value, onChange }: CustomBranchNameInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Validate branch name: no spaces, convert to lowercase kebab-case
    const formatted = e.target.value
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-/_]/g, "");
    onChange(formatted);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder="feature/my-branch-name"
        className={`flex-1 px-3 py-2 text-xs bg-background rounded border ${
          value ? "border-primary" : "border-border"
        } text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary`}
      />
      <span className="text-xs text-muted-foreground">
        Branch: {value || "(auto)"}
      </span>
    </div>
  );
}
