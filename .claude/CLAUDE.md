# Mux - Claude Code Instructions

## Project Overview

Mux is an agent coordinator for managing AI coding assistants. Built with Tauri (Rust backend) + React (TypeScript frontend).

## Component Library: shadcn/ui

We use **shadcn/ui** with Base UI primitives as our component library. This is the source of truth for all UI components and styling.

**Important**: The codebase is currently migrating from legacy CSS variables to shadcn/Tailwind. When working on any component:
1. **New code**: Always use Tailwind classes with shadcn colors
2. **Existing code**: When modifying, migrate inline styles to Tailwind classes
3. **Legacy variables**: Still exist for backward compatibility but should not be used in new code

## Design Philosophy

**"Terminal aesthetic meets clean minimalism"**

- Monospace typography throughout (Geist Mono)
- Dark, low-contrast backgrounds
- Minimal border-radius
- Accent colors for status and actions only
- No shadows in terminal theme
- Information density over whitespace

## Design System

We use **shadcn/ui** with Base UI primitives. The color system is defined in `src/index.css`.

### Tailwind Classes (Preferred)

Always use Tailwind classes with shadcn's color system. Never hardcode colors.

```tsx
// CORRECT - Use Tailwind with shadcn colors
<div className="bg-card text-foreground border border-border p-4 rounded-lg">

// WRONG - Don't use inline styles for colors
<div style={{ backgroundColor: "#141414", color: "#e5e5e5" }}>

// WRONG - Don't use legacy CSS variables in new code
<div style={{ backgroundColor: "var(--bg-surface)" }}>
```

### Color Palette (shadcn)

| Tailwind Class | CSS Variable | Usage |
|----------------|--------------|-------|
| `bg-background` | `--background` | App background |
| `bg-card` | `--card` | Cards, panels, sidebar |
| `bg-popover` | `--popover` | Modals, dropdowns, popovers |
| `bg-muted` | `--muted` | Hover states, subtle backgrounds |
| `bg-primary` | `--primary` | Primary actions (cyan) |
| `bg-secondary` | `--secondary` | Secondary backgrounds |
| `bg-destructive` | `--destructive` | Error/danger states |
| `text-foreground` | `--foreground` | Primary text (white) |
| `text-muted-foreground` | `--muted-foreground` | Secondary text |
| `text-primary` | `--primary` | Accent text (cyan) |
| `text-destructive` | `--destructive` | Error text (red) |
| `border-border` | `--border` | Default borders |
| `border-input` | `--input` | Input borders |

### Semantic Colors

| Tailwind Class | Usage |
|----------------|-------|
| `text-primary` | Primary actions, links, active states (cyan) |
| `text-success` | Success, running status (green) |
| `text-warning` | Warnings, waiting status (yellow) |
| `text-destructive` | Errors, destructive actions (red) |

### Typography

Font family is Geist Mono throughout. Use Tailwind text sizing:

```tsx
<span className="text-xs">12px - Small labels</span>
<span className="text-sm">14px - Body text</span>
<span className="text-base">16px - Emphasized</span>
<span className="text-lg">18px - Headers</span>
```

## UI Components (shadcn/ui)

All UI components are in `src/components/ui/`. Import from there.

### Button

```tsx
import { Button } from "@/components/ui/button";

// Variants: default | outline | secondary | ghost | destructive | link
// Sizes: default | sm | lg | icon | icon-sm | icon-xs

// Primary action (filled cyan)
<Button variant="default">Submit</Button>

// Secondary action (outlined)
<Button variant="outline">Cancel</Button>

// Ghost button (minimal, for toolbars)
<Button variant="ghost" size="icon">
  <Settings size={16} />
</Button>

// Destructive action
<Button variant="destructive">Delete</Button>
```

### Toggle

For toggle buttons (on/off states):

```tsx
import { Toggle } from "@/components/ui/toggle";

<Toggle pressed={isEnabled} onPressedChange={setIsEnabled}>
  Auto-accept
</Toggle>
```

### Tabs

```tsx
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

<Tabs value={activeTab} onValueChange={setActiveTab}>
  <TabsList>
    <TabsTrigger value="code">Code Review</TabsTrigger>
    <TabsTrigger value="terminal">Terminal</TabsTrigger>
  </TabsList>
  <TabsContent value="code">...</TabsContent>
  <TabsContent value="terminal">...</TabsContent>
</Tabs>
```

### DropdownMenu

```tsx
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

<DropdownMenu>
  <DropdownMenuTrigger>Open Menu</DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Option 1</DropdownMenuItem>
    <DropdownMenuSeparator />
    <DropdownMenuItem>Option 2</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>
```

### Toast

```tsx
import { useToast } from "@/contexts/ToastContext";

const { addToast } = useToast();

addToast({
  type: "success", // info | success | warning | error
  title: "Agent started",
  message: "Working on feature branch",
});
```

## Component Patterns

### 1. Use Tailwind Classes for Everything

```tsx
// CORRECT
<div className="flex items-center gap-2 p-4 bg-card text-foreground border border-border rounded-lg">

// AVOID - inline styles (legacy pattern being migrated)
<div style={{ backgroundColor: "var(--bg-surface)" }}>
```

### 2. Status Indicators

```tsx
// Running - green
<span className="text-success">⣾</span>

// Waiting - yellow
<span className="text-warning">●</span>

// Error - red
<span className="text-destructive">✕</span>

// Completed - muted
<span className="text-muted-foreground">✓</span>
```

### 3. Text Hierarchy

```tsx
// Primary text
<h2 className="text-foreground">Agent Name</h2>

// Secondary text
<p className="text-muted-foreground">Last updated 5m ago</p>

// Accent text
<span className="text-primary">Active</span>
```

## Legacy Code Migration

Some components still use legacy CSS variables (`var(--bg-surface)`, `var(--text-primary)`, etc.). When modifying these components, migrate to Tailwind classes:

| Legacy Variable | → | Tailwind Class |
|-----------------|---|----------------|
| `var(--bg-primary)` | → | `bg-background` |
| `var(--bg-surface)` | → | `bg-card` |
| `var(--bg-elevated)` | → | `bg-popover` |
| `var(--bg-hover)` | → | `bg-muted` |
| `var(--text-primary)` | → | `text-foreground` |
| `var(--text-secondary)` | → | `text-muted-foreground` |
| `var(--text-dim)` | → | `text-muted-foreground/50` |
| `var(--accent-cyan)` | → | `text-primary` |
| `var(--accent-green)` | → | `text-success` |
| `var(--accent-yellow)` | → | `text-warning` |
| `var(--accent-red)` | → | `text-destructive` |
| `var(--border-default)` | → | `border-border` |
| `var(--border-active)` | → | `border-input` |

## File Structure

```
src/
├── components/          # 29 total (25 + 4 ui/)
│   ├── ui/              # shadcn/ui base components
│   ├── ChatView.tsx     # Main agent view (largest)
│   ├── Sidebar.tsx      # Agent list sidebar
│   └── ...
├── hooks/               # 13 custom hooks
├── contexts/            # Theme + Toast providers
├── lib/
│   ├── utils.ts         # cn() utility for class merging
│   └── tauri.ts         # Tauri API bindings
└── index.css            # shadcn theme variables

src-tauri/src/
├── commands/            # Tauri command handlers
├── services/            # Core business logic
├── db.rs                # SQLite database
└── models/              # Data models
```

## Terminology

- **Agent** (not "Task") - An AI coding assistant instance
- **Spawn** (not "Create/New") - Starting a new agent
- **Workspace** - A configured repository/project

## Code Quality

- TypeScript strict mode
- No `any` types without justification
- Props interfaces for all components
- Use shadcn/ui components instead of raw HTML elements

## Git Workflow

- Feature branches from `main`
- Conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`
- PR reviews before merge

## Running the Project

```bash
# Development
npm run tauri dev

# Build
npm run tauri build

# Add shadcn component
npx shadcn@latest add <component-name>
```

## GitHub CLI

When using the `gh` CLI, always clear the GITHUB_TOKEN first to use the default authentication:

```bash
GITHUB_TOKEN= gh issue view 101
GITHUB_TOKEN= gh pr list
```

This ensures gh uses its own auth config instead of any environment token.
