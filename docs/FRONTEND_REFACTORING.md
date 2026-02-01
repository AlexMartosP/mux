# Frontend Refactoring Guide

This document outlines opportunities for simplifying the frontend codebase and making it easier for contributors.

## Current State Analysis

### Component Sizes (by line count)
| Component | Lines | Priority | Notes |
|-----------|-------|----------|-------|
| ChatView.tsx | 1766 | High | Largest, needs splitting |
| WorkspaceSettings.tsx | 927 | Medium | Large but well-organized |
| OutputRenderer.tsx | 755 | Medium | Complex rendering logic |
| ChangesPanel.tsx | 720 | Low | Already fixed hooks order |
| Onboarding.tsx | 663 | Medium | Could extract step components |
| Sidebar.tsx | 551 | Medium | Several inline components |
| Settings.tsx | 538 | Medium | Could be modularized |

## Completed Refactoring (Phase 1)

### New Reusable Components Created

1. **SlashCommandsDropdown** (`src/components/SlashCommandsDropdown.tsx`)
   - Extracted from ChatView (was duplicated twice)
   - Props: `commands`, `selectedIndex`, `onSelect`, `onHover`, `onRefresh`
   - Uses Tailwind classes for styling

2. **BranchSelector** (`src/components/BranchSelector.tsx`)
   - Extracted from ChatView (was duplicated twice)
   - Props: `branches`, `selectedBranch`, `onSelectBranch`, `newBranchMode`, etc.
   - Includes `CustomBranchNameInput` sub-component
   - Uses Tailwind classes for styling

3. **ErrorBoundary** (`src/components/ErrorBoundary.tsx`) - Enhanced
   - Added `name` prop for context
   - Added `inline` mode for smaller sections
   - Added `onError` callback
   - Added `withErrorBoundary` HOC for functional components
   - Uses Tailwind classes for styling

### Error Boundaries Added
- ChatView wrapped in App.tsx with `name="Agent View"`
- ChangesPanel wrapped with `inline` mode
- TerminalView wrapped with `inline` mode

## Recommended Future Refactoring (Phase 2)

### ChatView.tsx Splitting

Extract these major sections:

1. **NewTaskForm.tsx** (~480 lines)
   - New agent spawning interface
   - State: `repositoryPath`, `prompt`, `branches`, `customBranchName`, etc.
   - Effects: repos fetch, branch loading, slash command handling

2. **AgentHeader.tsx** (~280 lines)
   - Agent metadata and action buttons
   - State: `editingTitle`, `copiedBranch`, `isTakingOver`
   - Handlers: copy branch, edit title, open in editor

3. **OutputWithFollowups.tsx** (~120 lines)
   - Complex rendering logic for interleaving output and follow-up messages
   - The segment-building pattern is non-obvious

4. **FollowUpInput.tsx** (~195 lines)
   - Bottom input area with accept edits toggle
   - State: `followUpPrompt`, `showSlashCommands`

### Custom Hooks to Create

1. **useBranchSelection**
   ```typescript
   const { branches, selectedBranch, filteredBranches, ... } = useBranchSelection(repositoryPath);
   ```

2. **useSlashCommandsUI**
   ```typescript
   const { isOpen, selectedIndex, handlers } = useSlashCommandsUI(commands, isActive);
   ```

3. **useFollowUpMessages**
   ```typescript
   const { messages, addMessage } = useFollowUpMessages(agentId, output);
   ```

4. **useTextareaAutoResize**
   ```typescript
   const { ref } = useTextareaAutoResize(content, maxHeight);
   ```

### Other Components

**OutputRenderer.tsx**
- Extract `MarkdownRenderer` for consolidated Markdown customization
- Use a tool registry pattern instead of switch statement for tool display

**Sidebar.tsx**
- Extract `StatusIndicator` for status dot rendering
- Extract `RepoFilterDropdown` as separate component
- Extract `SelectModeActionBar` for bulk operations

**Settings.tsx**
- Break into sub-components: `NotificationSettings`, `AccessibilitySettings`, etc.
- Create reusable `SettingSection` wrapper

**Onboarding.tsx**
- Create `StepContainer`, `StepHeading`, `StepDescription` components

## Style Migration Guide

### Legacy CSS Variables → Tailwind

| Legacy Variable | Tailwind Class |
|-----------------|----------------|
| `var(--bg-primary)` | `bg-background` |
| `var(--bg-surface)` | `bg-card` |
| `var(--bg-elevated)` | `bg-popover` |
| `var(--bg-hover)` | `bg-muted` |
| `var(--text-primary)` | `text-foreground` |
| `var(--text-secondary)` | `text-muted-foreground` |
| `var(--text-dim)` | `text-muted-foreground/50` |
| `var(--accent-cyan)` | `text-primary` |
| `var(--accent-green)` | `text-success` |
| `var(--accent-yellow)` | `text-warning` |
| `var(--accent-red)` | `text-destructive` |
| `var(--border-default)` | `border-border` |
| `var(--border-active)` | `border-input` |

### Hover States
Replace inline hover handlers:
```tsx
// Before
onMouseEnter={(e) => e.currentTarget.style.color = 'var(--accent-cyan)'}
onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-dim)'}

// After
className="text-muted-foreground hover:text-primary transition-colors"
```

## Contribution Guidelines

### When adding new components:
1. Use Tailwind classes for all styling
2. Add error boundaries around sections that could fail
3. Keep components under 300 lines
4. Extract reusable patterns into shared components
5. Use TypeScript strict mode with proper interfaces

### Testing changes:
1. Run `npm run build` to verify TypeScript
2. Test in development with `npm run tauri dev`
3. Verify no console errors when navigating between agents
4. Test error recovery (error boundaries should show retry button)
