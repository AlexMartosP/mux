# MUX Design System

Terminal aesthetic meets clean minimalism.

## Design Principles

1. **Color = Meaning** - Colors communicate state, not decoration. Most UI elements are neutral. Color appears only when conveying status (error, success, warning) or primary interaction.

2. **One Primary Accent** - Cyan is the primary brand color. It marks interactive elements, focus states, and selected items. Everything else stays neutral.

3. **Terminal Aesthetic** - Monospace typography, dark backgrounds, and minimal color create a focused, developer-centric experience.

4. **Three Depth Levels** - Primary (base) → Surface (containers) → Elevated (overlays). Simple hierarchy that scales across themes.

---

## CSS Variables

### Backgrounds

```css
--bg-primary: #0a0a0a;    /* Base layer */
--bg-surface: #141414;    /* Cards, inputs, containers */
--bg-elevated: #1a1a1a;   /* Dropdowns, modals, selected states */
--bg-hover: #1f1f1f;      /* Hover state background */
```

### Text

```css
--text-primary: #e5e5e5;    /* Main content */
--text-secondary: #a3a3a3;  /* Supporting content */
--text-dim: #525252;        /* Placeholders, disabled */
```

### Borders

```css
--border-default: #262626;  /* Default borders */
--border-active: #404040;   /* Active/focus borders */
```

### Accent Colors

```css
--accent-cyan: #06b6d4;     /* Primary interactive */
--accent-green: #4ade80;    /* Success, running */
--accent-yellow: #facc15;   /* Warning, waiting */
--accent-red: #f87171;      /* Error, destructive */
```

### Subtle Backgrounds (State overlays)

```css
--bg-accent-subtle: rgba(6, 182, 212, 0.08);    /* Selected */
--bg-success-subtle: rgba(74, 222, 128, 0.08);  /* Running */
--bg-warning-subtle: rgba(250, 204, 21, 0.08);  /* Waiting */
--bg-error-subtle: rgba(248, 113, 113, 0.08);   /* Error */
--bg-overlay: rgba(0, 0, 0, 0.8);               /* Modal backdrop */
```

### Spacing

```css
--space-1: 4px;    /* Tight: icon padding, inline gaps */
--space-2: 8px;    /* Compact: button padding, small gaps */
--space-3: 12px;   /* Default: input padding, list item gaps */
--space-4: 16px;   /* Medium: card padding, section gaps */
--space-5: 20px;   /* Comfortable: panel padding */
--space-6: 24px;   /* Spacious: header padding, large gaps */
--space-8: 32px;   /* Large: major section separation */
--space-10: 40px;  /* Page margins */
--space-12: 48px;  /* Extra large: major layout gaps */
```

### Transitions

```css
--duration-fast: 100ms;     /* Micro-interactions: hover, focus */
--duration-normal: 150ms;   /* Default: buttons, toggles */
--duration-slow: 300ms;     /* Larger animations: modals, panels */
--easing-default: ease;
--easing-in-out: cubic-bezier(0.4, 0, 0.2, 1);
```

### Z-Index

```css
--z-base: 0;        /* Default content */
--z-dropdown: 100;  /* Dropdowns, menus, popovers */
--z-sticky: 200;    /* Sticky headers, floating elements */
--z-modal: 300;     /* Modals, dialogs */
--z-toast: 400;     /* Toasts, notifications */
```

### Focus

```css
--focus-ring: 0 0 0 2px var(--bg-primary), 0 0 0 4px var(--accent-cyan);
```

### Disabled

```css
--opacity-disabled: 0.4;
```

### Line Height

```css
--leading-tight: 1.25;
--leading-normal: 1.5;
--leading-relaxed: 1.75;
```

### Icon Sizes

```css
--icon-sm: 14px;
--icon-md: 16px;
--icon-lg: 20px;
--icon-xl: 24px;
```

### Other

```css
--font-family: 'Geist Mono', monospace;
--border-radius: 4px;
```

---

## Typography

### Font Family

```
'Geist Mono', monospace
```

Geist Mono by Vercel. Clean, modern monospace with excellent readability.

### Font Sizes

| Size | Use Case |
|------|----------|
| 10px | Labels, badges, helper text |
| 11px | Small text, descriptions, metadata |
| 12px | Body text, buttons, inputs (default) |
| 13px | Emphasized body text |
| 14px | Section headers, large text |
| 24px | Page titles |

### Font Weights

| Weight | Use Case |
|--------|----------|
| 400 | Body text |
| 500 | Buttons, labels |
| 600 | Headers |

---

## Buttons

### Variants

#### Primary
- Solid cyan background
- Used for main actions (Send, Submit)
- Hover: `opacity: 0.9`

#### Secondary
- Transparent with cyan border
- Used for important but not primary actions
- Hover: fills with cyan

#### Ghost
- No border, transparent background
- Used for most actions (navigation, secondary controls, toggles)
- Hover: `--bg-hover` background, `--text-secondary` color

### Sizes

| Size | Padding | Use Case |
|------|---------|----------|
| `default` | 6px 12px | Standard buttons with text |
| `sm` | 4px 8px | Compact buttons |
| `icon` | 8px (32x32) | Icon-only buttons |

### Icon Support

Buttons support `startIcon` and `endIcon` props for adding icons:

```tsx
<Button startIcon={<Plus size={14} strokeWidth={1.5} />}>
  NEW TASK
</Button>

<Button variant="ghost" size="icon">
  <Settings size={16} strokeWidth={1.5} />
</Button>
```

### Toggle Buttons

Use the `active` prop on ghost buttons for toggle states:
- OFF: dim text (`--text-dim`)
- ON: cyan text (`--accent-cyan`)

Hover uses a pseudo-element background to prevent layout shift.

```tsx
<Button variant="ghost" active={isEnabled}>
  Accept edits
</Button>
```

### Semantic Colors (Use Sparingly)

| Color | Use Case |
|-------|----------|
| `red` | Destructive actions: STOP, Archive |
| `yellow` | Caution actions |
| `green` | Confirmation actions |

### Disabled State

- Apply `opacity: var(--opacity-disabled)` and `cursor: not-allowed`
- No hover effects on disabled buttons

### Usage Guidelines

| Element | Variant | Size | Props |
|---------|---------|------|-------|
| Send button | Primary | icon | |
| Stop button | Secondary (yellow) | default | |
| Takeover / Handback | Secondary | default | |
| Open in / View PR | Secondary | default | |
| Archive | Secondary (red) | default | |
| Accept edits toggle | Ghost | default | `active={isOn}` |
| Sidebar icon buttons | Ghost | icon | |

---

## Icons

Using [Lucide icons](https://lucide.dev/).

### When to Use Icons

1. **Accessibility aids** - Arrows in dropdowns, expand/collapse indicators
2. **Context without words** - When space is limited and an icon communicates meaning (e.g., icon-only buttons)
3. **External brands** - Company logos and brand identifiers (GitHub, VS Code, Cursor)

### When NOT to Use Icons

- Don't add icons to buttons that already have clear text labels
- Don't use icons purely for decoration
- Prefer words over icons when space allows

### Sizes

| Size | Variable | Use Case |
|------|----------|----------|
| 14px | `--icon-sm` | Inline icons |
| 16px | `--icon-md` | Default, buttons |
| 20px | `--icon-lg` | Emphasis |
| 24px | `--icon-xl` | Large displays |

### Stroke Width

Always use `strokeWidth={1.5}` for consistency.

```tsx
<Icon size={16} strokeWidth={1.5} />
```

---

## State Indicators

States use subtle background tints without borders:

| State | Background | Label Color |
|-------|------------|-------------|
| Running | `--bg-success-subtle` | `--accent-green` |
| Waiting | `--bg-warning-subtle` | `--accent-yellow` |
| Error | `--bg-error-subtle` | `--accent-red` |
| Selected | `--bg-accent-subtle` | `--accent-cyan` |

---

## Inputs

```css
.input {
  padding: 8px 12px;
  font-size: 12px;
  background: var(--bg-primary);
  border: 1px solid var(--border-default);
  border-radius: 4px;
  color: var(--text-primary);
}

.input:focus {
  border-color: var(--accent-cyan);
}

.input::placeholder {
  color: var(--text-dim);
}
```

---

## Cards & Containers

### Surface Card
- `background: var(--bg-surface)`
- Used for grouping related content

### Elevated Card
- `background: var(--bg-elevated)`
- Used for dropdowns and overlays

---

## Focus States

Use the focus ring for keyboard navigation:

```css
.element:focus-visible {
  box-shadow: var(--focus-ring);
  outline: none;
}
```

---

## Color Usage Summary

| Element | Color | Rationale |
|---------|-------|-----------|
| Primary button | Cyan | Primary action |
| Secondary button | Cyan (outline) | Important but not primary |
| Ghost button | Neutral | Most actions |
| STOP button | Red | Destructive action |
| Archive button | Red | Destructive action |
| Accept edits (on) | Cyan | Active toggle |
| Running status | Green | Semantic state |
| Waiting status | Yellow | Semantic state |
| Error status | Red | Semantic state |
