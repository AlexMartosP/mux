# UI Redesign Plan: Terminal Aesthetic

## Vision

Transform the current soft, rounded UI into a sharp, terminal-inspired interface with:
- **Monospace typography** (Geist Mono)
- **Sharp edges** (no border-radius)
- **Grid/square layouts**
- **Terminal-like text rendering**
- **High contrast, minimal color palette**

## Design Principles

1. **Sharp & Precise**: No rounded corners. Everything is square/rectangular.
2. **Monospace First**: All text uses Geist Mono for a code-like feel.
3. **Grid-Based**: Layouts follow a strict grid system.
4. **Terminal Colors**: Dark background with bright, high-contrast text.
5. **Minimal Chrome**: Reduce visual noise, let content speak.
6. **Clean Borders**: Use CSS borders for structure, not ASCII characters.

## Color Palette

```
Background:     #0a0a0a (near black)
Surface:        #141414 (cards, panels)
Border:         #2a2a2a (subtle borders)
Border Active:  #3a3a3a (hover/focus)

Text Primary:   #e0e0e0 (main text)
Text Secondary: #808080 (muted text)
Text Dim:       #505050 (very muted)

Accent Green:   #00ff00 (success, running)
Accent Yellow:  #ffff00 (warning, waiting)
Accent Red:     #ff4444 (error)
Accent Cyan:    #00ffff (info, links)
Accent Magenta: #ff00ff (manual control)
```

## Typography

### Font: Geist Mono
- Load from Google Fonts
- Weights: 400 (regular), 500 (medium), 700 (bold)

### Type Scale
```
--font-xs:    11px    (labels, timestamps)
--font-sm:    12px    (secondary text)
--font-base:  13px    (body text)
--font-md:    14px    (headings)
--font-lg:    16px    (titles)
--font-xl:    18px    (page titles)
```

### Line Height
- Code blocks: 1.4
- Body text: 1.5

## Component Redesign

### 1. Global Styles
- [ ] Add Geist Mono font import
- [ ] Remove all `rounded-*` classes (replace with `rounded-none` or remove)
- [ ] Update color variables to terminal palette
- [ ] Set monospace as default font family
- [ ] Update scrollbar to be more minimal (thin, sharp)

### 2. Sidebar
- [ ] Sharp edges on container
- [ ] Task list items: no rounding, use left border for selection
- [ ] Status badges: square with single character or icon
- [ ] Add subtle grid lines between items
- [ ] "New Task" button: square, border-only style

**Before:** Rounded cards with pill badges

**After:** Flat items with left border accent, inline status indicator `[R]`

### 3. Task List Items
- [ ] Remove pill-shaped status badges
- [ ] Use single-letter status indicators: `[R]` running, `[C]` complete, `[E]` error, `[M]` manual
- [ ] Left border color indicates status
- [ ] Monospace task names (truncate with `...`)

### 4. Header Bar
- [ ] Sharp container, border-bottom only
- [ ] Status as inline text, not badge
- [ ] Action buttons: square, outlined style
- [ ] Tab bar: underline style, no background

**After:**
- Task name with inline `[RUNNING]` status badge
- Metadata line: `repo/name • branch-name`
- Border separator
- Tab bar with underline indicator + square action buttons

### 5. Output View
- [ ] Terminal-style output rendering
- [ ] Prefix lines with timestamps or indicators
- [ ] Tool calls shown as command-like blocks
- [ ] Text output as plain monospace
- [ ] Thinking blocks in dim/italic style

**Layout:**
- Message blocks with top border and label (`USER`, `CLAUDE`)
- Tool calls as indented blocks with icon + name
- Text output as plain monospace paragraphs
- Clear visual separation between message types

### 6. Activity Feed
- [ ] Inline status line instead of floating panel
- [ ] Show as: `▸ Reading src/App.tsx...`
- [ ] Pulsing cursor/indicator for active state

### 7. Diff Viewer
- [ ] Sharp container edges
- [ ] Line numbers in separate column
- [ ] `+` and `-` prefixes with green/red backgrounds
- [ ] File headers as bordered sections

### 8. Modals (Create PR, etc.)
- [ ] Sharp corners
- [ ] Single-pixel borders
- [ ] Form inputs: square, border-only style
- [ ] Buttons: square, high contrast

### 9. Form Inputs
- [ ] No rounded corners
- [ ] Thin border (1px)
- [ ] Focus: bright border color
- [ ] Placeholder text in dim color

### 10. Buttons
- [ ] Square (no border-radius)
- [ ] Primary: filled background
- [ ] Secondary: border-only (outlined)
- [ ] Hover: slight background change
- [ ] All uppercase or monospace text

---

## Implementation Todos

### Phase 1: Foundation
- [ ] **1.1** Add Geist Mono font to index.html
- [ ] **1.2** Update index.css with terminal color palette CSS variables
- [ ] **1.3** Set Geist Mono as default font-family
- [ ] **1.4** Create utility classes for terminal styling
- [ ] **1.5** Update scrollbar styles (thin, square)

### Phase 2: Layout Components
- [ ] **2.1** Update Sidebar.tsx - sharp edges, grid lines
- [ ] **2.2** Update TaskList.tsx - new status indicators, left borders
- [ ] **2.3** Update ChatView.tsx header - terminal style
- [ ] **2.4** Update tab bar styling

### Phase 3: Content Components
- [ ] **3.1** Update OutputRenderer.tsx - terminal-style blocks
- [ ] **3.2** Update ActivityFeed.tsx - inline status line
- [ ] **3.3** Update DiffViewer.tsx - sharp edges, proper line formatting
- [ ] **3.4** Update FileTree.tsx - indented list with borders

### Phase 4: Interactive Components
- [ ] **4.1** Create terminal-style Button component
- [ ] **4.2** Create terminal-style Input component
- [ ] **4.3** Create terminal-style TextArea component
- [ ] **4.4** Update CreatePRModal.tsx with new components
- [ ] **4.5** Update new task form in ChatView.tsx

### Phase 5: Polish
- [ ] **5.1** Add subtle animations (cursor blink, typing effect)
- [ ] **5.2** Ensure consistent spacing throughout
- [ ] **5.3** Test all status states with new colors
- [ ] **5.4** Review and adjust contrast for accessibility
- [ ] **5.5** Final review of all components

---

## File Changes Summary

| File | Changes |
|------|---------|
| `index.html` | Add Geist Mono font link |
| `src/index.css` | Terminal color palette, base styles |
| `src/components/Sidebar.tsx` | Sharp edges, new layout |
| `src/components/TaskList.tsx` | Status indicators, borders |
| `src/components/ChatView.tsx` | Header redesign, tabs |
| `src/components/OutputRenderer.tsx` | Terminal-style output |
| `src/components/ActivityFeed.tsx` | Inline status |
| `src/components/DiffViewer.tsx` | Sharp diff view |
| `src/components/FileTree.tsx` | ASCII tree characters |
| `src/components/CreatePRModal.tsx` | Terminal modal style |

---

## Visual Reference

### Current Style
- Rounded corners (`rounded-lg`, `rounded-full`)
- Soft shadows
- Gradient backgrounds
- System font stack

### Target Style
- Square corners (0 border-radius)
- Sharp 1px borders
- Flat, solid colors
- Monospace font (Geist Mono)
- Clean, minimal UI elements

---

## Notes

- Keep Tailwind CSS - just replace classes
- Dark theme only
- Maintain accessibility (sufficient contrast ratios)
- Focus on clean, functional TUI aesthetic
