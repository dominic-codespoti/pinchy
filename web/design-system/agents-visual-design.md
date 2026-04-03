# Pinchy Agents Interface - Visual Design System

## Overview

This document defines the complete visual design system for the new Pinchy agents management interface. The design prioritizes **clarity over decoration** using shadcn/ui primitives for a modern, accessible, and consistent user experience.

---

## Design Principles

1. **Component-First Architecture** - Build as shadcn compositions, not styled HTML
2. **Clarity Over Decoration** - Simpler layouts with fewer visual treatments
3. **Consistency** - Reuse patterns from existing Pinchy UI
4. **Accessibility** - WCAG 2.1 AA compliance (keyboard nav, focus states, ARIA)

---

## Color Palette

### Base Colors (CSS Variables)

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--background` | `hsl(0 0% 100%)` | `hsl(240 10% 3.9%)` | Page background |
| `--foreground` | `hsl(240 10% 3.9%)` | `hsl(0 0% 98%)` | Primary text |
| `--card` | `hsl(0 0% 100%)` | `hsl(240 10% 3.9%)` | Card backgrounds |
| `--primary` | `hsl(240 5.9% 10%)` | `hsl(0 0% 98%)` | Primary buttons |
| `--secondary` | `hsl(240 4.8% 95.9%)` | `hsl(240 3.7% 15.9%)` | Secondary elements |
| `--muted` | `hsl(240 4.8% 95.9%)` | `hsl(240 3.7% 15.9%)` | Muted backgrounds |
| `--muted-foreground` | `hsl(240 3.8% 46.1%)` | `hsl(240 5% 64.9%)` | Secondary text |
| `--destructive` | `hsl(0 84.2% 60.2%)` | `hsl(0 62.8% 30.6%)` | Error states |
| `--border` | `hsl(240 5.9% 90%)` | `hsl(240 3.7% 15.9%)` | Borders |
| `--ring` | `hsl(240 5.9% 10%)` | `hsl(240 4.9% 83.9%)` | Focus rings |

### Status Colors

| Status | Background | Text | Border | Dot | Usage |
|--------|------------|------|--------|-----|-------|
| **Online** | `emerald-50/15` | `emerald-700/400` | `emerald-500/20` | `emerald-500` | Active agents |
| **Offline** | `slate-100/20` | `slate-700/400` | `slate-500/20` | `slate-500` | Inactive agents |
| **Error** | `rose-50/15` | `rose-700/400` | `rose-500/20` | `rose-500` | Failed/error state |
| **Warning** | `amber-50/15` | `amber-700/400` | `amber-500/20` | `amber-500` | Degraded/warning |
| **Pending** | `blue-50/15` | `blue-700/400` | `blue-500/20` | `blue-500` | Loading/setup |

### Accent Colors (for Metric Cards)

| Accent | Background | Text | Usage |
|--------|------------|------|-------|
| **Blue** | `blue-500/10` | `blue-500` | Messages, communication |
| **Green** | `green-500/10` | `green-500` | Success, active sessions |
| **Violet** | `violet-500/10` | `violet-500` | AI, intelligence |
| **Amber** | `amber-500/10` | `amber-500` | Warnings, attention |
| **Rose** | `rose-500/10` | `rose-500` | Errors, critical |
| **Emerald** | `emerald-500/10` | `emerald-500` | Growth, completion |

---

## Typography

### Font Stack

```
system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
```

### Type Scale

| Level | Size | Line Height | Letter Spacing | Usage |
|-------|------|-------------|----------------|-------|
| **4xl** | 2.25rem | 2.5rem | -0.03em | Page titles |
| **3xl** | 1.875rem | 2.25rem | -0.02em | Section headers |
| **2xl** | 1.5rem | 2rem | -0.02em | Card titles |
| **xl** | 1.25rem | 1.75rem | -0.01em | Subsection headers |
| **lg** | 1.125rem | 1.75rem | -0.01em | Large body |
| **base** | 1rem | 1.5rem | 0 | Body text |
| **sm** | 0.875rem | 1.25rem | 0 | Small text, labels |
| **xs** | 0.75rem | 1rem | 0 | Captions, metadata |

### Hierarchy Usage

| Element | Size | Weight | Tracking |
|---------|------|--------|----------|
| Page Title | 2.25rem | 700 | -0.03em |
| Section Title | 1.5rem | 600 | -0.02em |
| Card Title | 1.125rem | 600 | -0.01em |
| Body | 1rem | 400 | 0 |
| Small | 0.875rem | 400 | 0 |
| Caption | 0.75rem | 500 | 0 |

---

## Spacing System

### Scale

| Token | Value |
|-------|-------|
| `0` | 0 |
| `0.5` | 0.125rem (2px) |
| `1` | 0.25rem (4px) |
| `2` | 0.5rem (8px) |
| `3` | 0.75rem (12px) |
| `4` | 1rem (16px) |
| `5` | 1.25rem (20px) |
| `6` | 1.5rem (24px) |
| `8` | 2rem (32px) |
| `10` | 2.5rem (40px) |
| `12` | 3rem (48px) |
| `16` | 4rem (64px) |

### Component Spacing

| Context | Value |
|---------|-------|
| Card padding | 1.5rem (24px) |
| Card gap | 1rem (16px) |
| Section gap | 2rem (32px) |
| Page padding | 2rem (32px) |
| Input padding | 0.75rem 1rem |
| Button padding | 0.5rem 1rem |

---

## Shadows & Elevation

| Level | Shadow | Usage |
|-------|--------|-------|
| `sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` | Subtle elevation |
| `DEFAULT` | `0 1px 3px 0 rgb(0 0 0 / 0.1)` | Cards default |
| `md` | `0 4px 6px -1px rgb(0 0 0 / 0.1)` | Elevated cards |
| `lg` | `0 10px 15px -3px rgb(0 0 0 / 0.1)` | Hover states |
| `xl` | `0 20px 25px -5px rgb(0 0 0 / 0.1)` | Modals, sheets |
| `cardHover` | `0 10px 15px -3px rgb(0 0 0 / 0.1)` | Card hover |
| `dialog` | `0 25px 50px -12px rgb(0 0 0 / 0.25)` | Dialog overlay |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `sm` | 0.375rem | Small elements |
| `DEFAULT` | 0.5rem | Buttons, inputs |
| `md` | 0.75rem | Cards |
| `lg` | 1rem | Large cards |
| `xl` | 1.5rem | Hero elements |
| `full` | 9999px | Avatars, pills |

---

## Animation Specifications

### Duration

| Speed | Value | Usage |
|-------|-------|-------|
| Fast | 150ms | Micro-interactions |
| Normal | 200ms | Standard transitions |
| Slow | 300ms | Emphasis animations |
| Slower | 500ms | Page transitions |

### Easing Functions

| Name | Value | Usage |
|------|-------|-------|
| Default | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard transitions |
| In | `cubic-bezier(0.4, 0, 1, 1)` | Exit animations |
| Out | `cubic-bezier(0, 0, 0.2, 1)` | Enter animations |
| Bounce | `cubic-bezier(0.68, -0.55, 0.265, 1.55)` | Playful interactions |
| Spring | `cubic-bezier(0.16, 1, 0.3, 1)` | Dialogs, sheets |

### Interactions

#### Card Hover
```css
transform: translateY(-2px);
box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
```

#### Button Press
```css
transform: scale(0.98);
transition: transform 100ms ease;
```

#### Tab Switch
```css
/* Indicator */
border-bottom: 2px solid hsl(var(--primary));
transition: all 200ms ease;

/* Content */
opacity: 0 → 1;
transition: opacity 200ms ease;
```

#### Dialog Enter
```css
/* Overlay */
opacity: 0 → 1;
transition: opacity 200ms ease;

/* Content */
opacity: 0 → 1;
transform: scale(0.95) → scale(1);
transition: all 300ms cubic-bezier(0.16, 1, 0.3, 1);
```

#### Status Pulse
```css
animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
opacity: 0.75;
```

---

## Page Specifications

### 1. Agents List Page

#### Header
```
┌─────────────────────────────────────────────────────────────┐
│ Agents                                    [+ Create Agent]  │
│ Manage and monitor your AI agents                           │
└─────────────────────────────────────────────────────────────┘
```

#### Search & Filters
```
┌─────────────────────────────────────────────────────────────┐
│ [🔍 Search agents...        ] [All Statuses ▼] [All Models ▼] [⚙️] │
└─────────────────────────────────────────────────────────────┘
```

#### Agent Grid (Desktop - 3 columns)
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ 👤 Name    ⋮ │ │ 👤 Name    ⋮ │ │ 👤 Name    ⋮ │
│ ● Online    │ │ ○ Offline   │ │ ● Online    │
│             │ │             │ │             │
│ Description │ │ Description │ │ Description │
│             │ │             │ │             │
│ [Model] [P] │ │ [Model] [P] │ │ [Model] [P] │
├─────────────┤ ├─────────────┤ ├─────────────┤
│ 12 ses 342m │ │ 5 ses  89m  │ │ 24 ses 1.2k │
│ Updated 2h  │ │ Updated 1d  │ │ Updated 5m  │
└─────────────┘ └─────────────┘ └─────────────┘
```

**Card Hover Effects:**
- Card lifts (translateY -2px)
- Shadow increases (lg)
- Action menu appears (opacity 0 → 1)
- Duration: 200ms ease

**Empty State:**
```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                    ┌───────────┐                           │
│                    │   🤖      │                           │
│                    └───────────┘                           │
│                                                             │
│                   No agents yet                             │
│    Create your first agent to get started with AI-powered   │
│                    workflows.                                 │
│                                                             │
│                   [+ Create Agent]                           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 2. Agent Detail Page

#### Hero Header
```
┌─────────────────────────────────────────────────────────────┐
│ ┌────┐ Agent Name                           [Test] [Edit] [⋯]│
│ │ 👤 │ ● Online                                              │
│ └────┘ [gpt-4] [OpenAI]  ID: agent_123                      │
│                                                             │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│ │💬 24     │ │🧠 1,234  │ │📄 12     │ │🕒 2m ago  │        │
│ │Sessions  │ │Memories  │ │Files     │ │Last Active│        │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │
└─────────────────────────────────────────────────────────────┘
```

#### Tab Bar
```
┌─────────────────────────────────────────────────────────────┐
│ 📊 Overview │ 📁 Files │ 🧠 Memory │ 💬 Sessions │ ▶️ Test │ ⚙️ Settings│
│▔▔▔▔▔▔▔▔▔▔▔▔▔│          │           │             │         │            │
└─────────────────────────────────────────────────────────────┘
```

**Tab Design:**
- Underline indicator on active tab (2px primary color)
- Icon + label on desktop
- Icon only on tablet
- Scrollable on mobile

#### Overview Tab
```
┌─────────────────────────────────────────────────────────────┐
│ Performance Stats                                           │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│ │📊 1,234  │ │🪙 45.2K  │ │⏱️ 1.2s  │                     │
│ │Messages  │ │Tokens    │ │Avg Resp  │                     │
│ └──────────┘ └──────────┘ └──────────┘                     │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Recent Activity                                         │ │
│ │ Latest interactions and events                          │ │
│ │                                                         │ │
│ │ ● Message received                                      │ │
│ │   User asked about project status              2m ago  │ │
│ │                                                         │ │
│ │ 📄 File updated                                         │ │
│ │   system-prompt.md modified                    5m ago  │ │
│ │                                                         │ │
│ │ 🧠 Memory saved                                         │ │
│ │   User prefers concise responses               1h ago  │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### Files Tab (Split View)
```
┌─────────────────────────────────────────────────────────────┐
│ ┌──────────────┬──────────────────────────────────────────┐  │
│ │ 🔍 Search... │ system-prompt.md              [💾] [⬇️]  │  │
│ │              │──────────────────────────────────────────│  │
│ │ 📁 skills    │                                          │  │
│ │ 📁 memory    │  # System Prompt                         │  │
│ │ 📄 SOUL.md   │                                          │  │
│ │ 📄 TOOLS.md  │  You are a helpful assistant...        │  │
│ │ 📄 ...       │                                          │  │
│ └──────────────┘                                          │  │
│                  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

#### Memory Tab
```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Search memories...      [All Types ▼]  [+ Add Memory]      │
│                                                             │
│ ┌─────────────────────────┐ ┌─────────────────────────┐    │
│ │ [Fact]              ⋮  │ │ [Preference]         ⋮  │    │
│ │                         │ │                         │    │
│ │ User's favorite         │ │ User prefers short     │    │
│ │ programming language    │ │ responses              │    │
│ │ is Rust                 │ │                         │    │
│ │                         │ │ 2 hours ago            │    │
│ │ 3 hours ago             │ │                         │    │
│ └─────────────────────────┘ └─────────────────────────┘    │
│                                                             │
│ ┌─────────────────────────┐ ┌─────────────────────────┐    │
│ │ [Context]           ⋮  │ │ [Skill]              ⋮  │    │
│ │ ...                     │ │ ...                     │    │
│ └─────────────────────────┘ └─────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

#### Sessions Tab
```
┌─────────────────────────────────────────────────────────────┐
│ 🔍 Search...  [All Status ▼]                  [+ New Session] │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Session        Status    Messages  Duration  Created    > │ │
│ │ ─────────────────────────────────────────────────────────  │
│ │ 💬 Chat #123   ● Online    45      12m      2m ago     > │ │
│ │ 💬 Chat #122   ○ Offline   12      5m       1h ago     > │ │
│ │ 💬 Chat #121   ● Online    89      45m      3h ago     > │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### Test Tab (Chat Interface)
```
┌─────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────┐ │
│ │                                                         │ │
│ │                    ┌──────────┐                          │ │
│ │ 👤                 │ Hello!   │                  🤖     │ │
│ │                    │          │                          │ │
│ │                    └──────────┘                          │ │
│ │ 2:30 PM                                                 │ │
│ │                                                         │ │
│ │                    ┌──────────────────────────────────┐  │ │
│ │                    │ Hi! How can I help you today?    │  │ │
│ │                    │                                  │  │ │
│ │                    └──────────────────────────────────┘  │ │
│ │                                            2:31 PM      │ │
│ │                                                         │ │
├───────────────────────────────────────────────────────────┤ │
│ │ [Type your message...                    ] [⬆️] [📎]   │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

#### Settings Tab
```
┌─────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Basic Information                                       │ │
│ │ General agent settings and identification               │ │
│ │                                                         │ │
│ │ Agent Name          [My Assistant              ]        │ │
│ │ Description         [What does this agent do?    ]        │ │
│ │                     [GPT-4 ▼]  [OpenAI ▼]               │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Behavior                                                │ │
│ │ Configure how the agent behaves and responds            │ │
│ │                                                         │ │
│ │ System Prompt                                           │ │
│ │ [                                                  ]    │ │
│ │ [                                                  ]    │ │
│ │ [Enter system instructions...                      ]    │ │
│ │ [                                                  ]    │ │
│ │                                                         │ │
│ │ Temperature [━━━━━━●───────]  0.7                      │ │
│ │ Max Tokens  [4096        ]                              │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Advanced                                                │ │
│ │ Advanced configuration options                          │ │
│ │                                                         │ │
│ │ Auto-save memories                     [━━●━━]          │ │
│ │ Automatically save important info                       │ │
│ │ ────────────────────────────────────────────────────────  │ │
│ │ Enable web search                      [━━●━━]          │ │
│ │ Allow the agent to search the web                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│                              [Cancel] [Save Changes]        │
└─────────────────────────────────────────────────────────────┘
```

---

## Component Specifications

### StatusPill

```tsx
<StatusPill 
  variant="online"      // online | offline | error | warning | pending | unknown
  pulse={true}          // Optional: enable pulse animation
  showLabel={true}      // Show text label (default: true)
  label="Custom Label"  // Override default label
/>
```

**Variants:**
- `online` - Green with pulsing dot
- `offline` - Gray/neutral
- `error` - Red/destructive
- `warning` - Amber
- `pending` - Blue
- `unknown` - Muted gray

### AgentCard

```tsx
<Card className="group relative overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
  <CardHeader className="pb-3">
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12 border-2 border-border">
          <AvatarFallback>{agent.initials}</AvatarFallback>
        </Avatar>
        <div>
          <CardTitle className="text-base font-semibold">{agent.name}</CardTitle>
          <StatusPill variant={agent.status} pulse={agent.status === 'online'} className="mt-1" />
        </div>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem><Play className="mr-2 h-4 w-4" /> Test Agent</DropdownMenuItem>
          <DropdownMenuItem><Edit className="mr-2 h-4 w-4" /> Edit</DropdownMenuItem>
          <DropdownMenuItem><Copy className="mr-2 h-4 w-4" /> Clone</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive">
            <Trash className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </CardHeader>
  <CardContent className="pt-0">
    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
      {agent.description}
    </p>
    <div className="flex items-center gap-2 flex-wrap">
      <Badge variant="secondary" className="text-xs">{agent.model}</Badge>
      <Badge variant="outline" className="text-xs">{agent.provider}</Badge>
    </div>
  </CardContent>
  <CardFooter className="pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
    <div className="flex items-center gap-4">
      <span>{agent.sessionCount} sessions</span>
      <span>{agent.memoryCount} memories</span>
    </div>
    <span>Updated {agent.lastUpdated}</span>
  </CardFooter>
</Card>
```

### MetricCard

```tsx
<MetricCard
  title="Messages"
  value="1,234"
  icon={MessageSquare}
  accent="blue"        // blue | green | violet | amber | rose | emerald
  trend={{             // Optional
    direction: 'up',
    value: '12%',
    positive: true
  }}
/>
```

---

## Responsive Behavior

### Breakpoints

| Name | Min Width | Max Width |
|------|-----------|-----------|
| `sm` | 640px | - |
| `md` | 768px | - |
| `lg` | 1024px | - |
| `xl` | 1280px | - |
| `2xl` | 1400px | - |

### Agents List Page

| Viewport | Grid Columns | Filter Layout | Card Actions |
|----------|--------------|---------------|--------------|
| Desktop (>1024px) | 3 | Horizontal row | Hover reveal |
| Tablet (768-1024px) | 2 | Horizontal compact | Always visible |
| Mobile (<768px) | 1 | Stacked vertical | Always visible |

### Agent Detail Page

| Viewport | Hero Layout | Stats Grid | Files Tab | Tabs |
|----------|-------------|------------|-----------|------|
| Desktop (>1024px) | Side-by-side | 4 columns | Sidebar+Editor | Full labels |
| Tablet (768-1024px) | Stacked | 2 columns | 50/50 split | Icon+label |
| Mobile (<768px) | Fully stacked | 2 compact | Tab switcher | Scrollable |

---

## Accessibility

### Focus Visible

```css
:focus-visible {
  outline: 2px solid hsl(var(--ring));
  outline-offset: 2px;
}
```

### Keyboard Navigation

| Component | Interaction |
|-----------|-------------|
| **Card** | Enter to open, Tab to navigate |
| **Tabs** | Arrow keys to switch, Tab to enter content |
| **Dropdown** | Enter/Space to open, Arrows to navigate, Escape to close |
| **Dialog** | Tab cycles focus, Escape to close |
| **Button** | Enter/Space to activate |

### Screen Reader Labels

```tsx
// Agent Card
<div aria-label={`Agent ${name}, status ${status}`}>

// Status Pill
<span role="status" aria-live="polite">

// Tab List
<div role="tablist" aria-orientation="horizontal">

// Tab Trigger
<button 
  role="tab" 
  aria-selected={isActive}
  aria-controls={panelId}
>

// Tab Panel
<div 
  role="tabpanel" 
  aria-labelledby={triggerId}
>
```

### Color Contrast

| Element | Ratio | Status |
|---------|-------|--------|
| Normal text on background | 7:1 | ✅ Passes AAA |
| Muted text on background | 4.6:1 | ✅ Passes AA |
| Status pills | 4.5:1+ | ✅ All pass AA |
| Buttons on background | 7:1 | ✅ Passes AAA |

---

## Dark Mode

### Strategy

- CSS variables with class-based switching via `next-themes`
- `class` attribute on html element: `dark` or `light`
- All components support dark mode automatically via CSS variables

### Color Mapping (Light → Dark)

| Light | Dark |
|-------|------|
| White background | `hsl(240 10% 3.9%)` |
| Light cards | Slightly lighter than background |
| Dark text | High contrast white/gray |
| Bright accents | Saturated but dimmed |

---

## File Structure

```
app/
├── agents/
│   ├── page.tsx                    # Agents list page
│   ├── [id]/
│   │   └── page.tsx                # Agent detail page
│   └── new/
│       └── page.tsx                # Create agent page

features/
├── agents/
│   ├── index.ts                    # Public exports
│   ├── components/
│   │   ├── agent-list.tsx          # List container
│   │   ├── agent-card.tsx          # Individual card
│   │   ├── agent-detail.tsx        # Detail container
│   │   ├── agent-form.tsx          # Create/edit form
│   │   ├── agent-stats.tsx         # Stats section
│   │   ├── agent-activity.tsx      # Activity timeline
│   │   ├── agent-files.tsx         # Files tab
│   │   ├── agent-memory.tsx        # Memory tab
│   │   ├── agent-sessions.tsx      # Sessions tab
│   │   ├── agent-test.tsx          # Test/chat tab
│   │   ├── agent-settings.tsx      # Settings tab
│   │   ├── agent-empty-state.tsx   # Empty state
│   │   └── agent-skeleton.tsx      # Loading states
│   ├── hooks/
│   │   ├── use-agents.ts
│   │   ├── use-agent.ts
│   │   ├── use-agent-stats.ts
│   │   ├── use-agent-sessions.ts
│   │   ├── use-agent-memory.ts
│   │   └── use-agent-files.ts
│   └── types/
│       └── agent.ts
```

---

## Implementation Checklist

### Visual Components
- [x] Color palette defined (status, accents, base)
- [x] Typography scale documented
- [x] Spacing system established
- [x] Shadow/elevation levels specified
- [x] Border radius tokens defined

### Page Designs
- [x] Agents List Page
  - [x] Header with CTA
  - [x] Search and filters
  - [x] Card grid with hover states
  - [x] Empty state
  - [x] Loading state
- [x] Agent Detail Page
  - [x] Hero header with stats
  - [x] Tab bar design
  - [x] Overview tab
  - [x] Files tab
  - [x] Memory tab
  - [x] Sessions tab
  - [x] Test tab
  - [x] Settings tab

### Interactions & Animation
- [x] Card hover effects
- [x] Button press states
- [x] Tab switching
- [x] Dialog/Sheet animations
- [x] Skeleton loading
- [x] Status pulse

### Responsive
- [x] Desktop layout (>1024px)
- [x] Tablet layout (768-1024px)
- [x] Mobile layout (<768px)
- [x] Breakpoints defined

### Accessibility
- [x] Focus visible states
- [x] Keyboard navigation
- [x] Screen reader labels
- [x] Color contrast ratios

---

## References

- **shadcn/ui**: https://ui.shadcn.com
- **Radix UI Primitives**: https://www.radix-ui.com
- **Tailwind CSS**: https://tailwindcss.com
- **WCAG 2.1**: https://www.w3.org/WAI/WCAG21/quickref/
