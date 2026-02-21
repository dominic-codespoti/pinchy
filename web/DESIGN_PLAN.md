# Pinchy Web — Visual Upgrade Plan
*Inspired by the Aikura design system*

## Current State

Pinchy's React app is **functional and well-architected** — TanStack Router + Query, Zustand, Zod-validated API, WebSocket streaming, command palette, responsive sidebar. The code quality is high. What it lacks is **visual polish and depth** — it reads as a raw dev tool, not a polished ops console.

### What's Working
- Dark-only color scheme (good for ops console)
- Emerald accent (shared DNA with Aikura)
- CVA variant system on all components
- Custom scrollbars, focus rings, route transitions
- Command palette (⌘K)
- Responsive sidebar with mobile overlay

### What's Flat/Ugly
- Cards are flat rectangles with almost no depth (1px border, no shadow, no glow)
- No glassmorphism — everything is opaque solid backgrounds
- No background texture — just a dead flat `#05090f` void
- Sidebar feels cramped and utilitarian (no header/branding, no footer, no avatar)
- Header is basic — small text, no visual weight
- No hover micro-interactions (no lift, no glow, no scale)
- No loading skeletons — just a "Loading route..." text string
- Typography is functional but not layered — needs more contrast between headings and body
- Inline SVG icons are fine but inconsistent vs. a real icon library
- No neon/glow effects anywhere — everything is matte
- Stat cards on the dashboard are plain boxes with numbers

---

## The Plan

### Phase 1: Foundation — Design Tokens & Global CSS
**Files: `global.css`, `tailwind.config.ts`**

1. **Add glass/neon CSS variables** matching Aikura's dark mode tokens:
   ```css
   --glass-bg: rgba(255, 255, 255, 0.06);
   --glass-border: rgba(52, 211, 153, 0.15);
   --neon-emerald: #34d399;
   --neon-glow: 0 0 15px rgba(52, 211, 153, 0.25);
   ```

2. **Add a subtle blueprint grid background** on body (same as Aikura but more subtle, befitting an ops console):
   - Faint emerald grid lines at 40px intervals
   - Very low opacity (0.02–0.03)
   - Fixed attachment so it doesn't scroll with content

3. **Add utility classes** to `global.css`:
   - `.glass-panel` — backdrop-blur + translucent bg + emerald-tinted border + layered box-shadow
   - `.neon-glow` — emerald box-shadow glow
   - `.neon-text` — emerald color + text-shadow
   - `.animate-glow-pulse` — subtle pulsing glow animation for status indicators

4. **Extend tailwind config**:
   - Add `tailwindcss-animate` plugin for Radix-compatible enter/exit animations
   - Add `boxShadow` tokens: `glow`, `glass`, `elevated`
   - Add `backdrop-blur` token
   - Add `animation` and `keyframes` for glow-pulse, shimmer (skeleton loading)

### Phase 2: Component Library Upgrades
**File: `components/ui.tsx`**

1. **Card → Glass Card**: Change from flat `bg-[#0d1422]` to `glass-panel` class. Add layered box-shadow for depth. On hover: subtle `translateY(-1px)` + stronger glow.

2. **Panel component**: Add glass styling, more generous padding (`p-4` not `p-3`), title text gets a subtle emerald accent dot or left border.

3. **Button upgrades**:
   - Primary: Add neon glow shadow on hover (`0 0 20px rgba(52,211,153,0.3)`)
   - All variants: Add `transition-all duration-200` for smooth hover states
   - Add subtle scale on hover: `hover:scale-[1.02]` for primary

4. **Badge upgrades**: Add subtle backdrop-blur. Success badge gets a gentle glow.

5. **Input/TextArea/Select**: Add glass-bg treatment, emerald focus glow ring (stronger than current)

6. **Dialog**: Already decent — add glass-panel background, stronger backdrop blur

7. **Tabs**: Active tab gets a subtle emerald bottom border glow, not just a bg swap

8. **Add Skeleton component** (new):
   ```tsx
   export function Skeleton({ className }: { className?: string }) {
     return <div className={cn("animate-shimmer rounded-md bg-slate-300/8", className)} />;
   }
   ```

9. **Add Progress component** (new) — emerald gradient bar with glow, useful for token usage display

### Phase 3: Layout & Navigation Glow-Up
**File: `app/router.tsx`**

1. **Header overhaul**:
   - Give it more height and visual weight
   - Add a bottom glow line (1px emerald gradient border, fading to transparent at edges)
   - Brand mark: add a small emerald dot/circle before "Pinchy" or a subtle logo glyph
   - Move "Operations Console" subtitle to a muted line below, increase "Pinchy Control Grid" size
   - Command palette button gets a glass treatment

2. **Sidebar upgrade**:
   - Add a header section with Pinchy branding (emerald accent glyph + name)
   - Add a search/filter input at the top (like Aikura's sidebar search)
   - Nav items: On active — add a left emerald border glow (3px solid emerald with glow), not just bg change
   - Nav items: On hover — subtle glass bg lift effect
   - Add a footer section: build version, or a collapsed info line
   - Increase spacing between items for breathing room (`space-y-1` → `space-y-1.5`)
   - Section labels between groups (e.g., "Operations" before Chat/Overview, "Management" before Agents/Config)

3. **Main content area**:
   - Add subtle glass-panel treatment to the outer container
   - Inner padding bump from `p-2.5` to `p-4` or `p-5`
   - Better route transition (opacity + slight y-translate, 200ms easeOut — match Aikura's framer-motion feel with pure CSS)

### Phase 4: Icon System
**File: new `components/icons.tsx` or switch to `lucide-react`**

Two options (recommend option A):

**Option A — Install `lucide-react`**: Same icon library as Aikura. Consistent, beautiful, 1000+ icons. Replace all inline SVGs in router.tsx with named Lucide components. Much cleaner code too.

**Option B — Keep custom SVGs**: Create a dedicated `icons.tsx` with all nav icons as named exports. Polish the SVG paths for visual consistency.

### Phase 5: Page-Level Polish

#### Dashboard (`routes/dashboard.tsx`)
- **Stat cards**: Glass-panel treatment with subtle emerald accent lines. Add icon per stat. On hover: lift + glow.
- **Heartbeat grid**: Each agent card gets a glass treatment with a health-indicator glow (green glow for healthy, red for unhealthy, amber for stale)
- **Event timeline**: Glass-panel container. Each event row gets a subtle left-border colored by event type. Selected event gets emerald glow border.
- **Add sparkline chart**: Consider adding `recharts` or keep the unicode sparklines but style them with emerald color

#### Chat (`routes/chat.tsx`)
- **Message bubbles**: Glass treatment. User messages get a subtle emerald tint. Agent messages stay neutral glass.
- **Tool activity sidebar**: Glass-panel cards for each tool call with status glow
- **Compose area**: Glass input with emerald focus glow, send button gets primary neon treatment
- **Typing indicator**: Add a subtle glow pulse to the dots

#### Agents (`routes/agents.tsx`)
- **Agent cards**: Glass-panel with avatar/initial circle, emerald accent for online agents
- **Detail tabs**: Better styled tab bar with emerald active indicator
- **File editor**: Monospace font (JetBrains Mono or SF Mono fallback), glass-panel code area with subtle syntax-like styling

#### Cron (`routes/cron.tsx`)
- **Job cards**: Glass treatment, status badges with glow for running/active
- **Schedule preview**: Monospace emerald text
- **Run history**: Timeline-style with connecting line and status dots

#### Sessions (`routes/sessions.tsx`)
- **Session list**: Glass-panel rows with timestamp, message count badges
- **Session detail**: Message viewer with glass bubbles, cleaner diff/edit UI

#### Config (`routes/config.tsx`)
- **Form mode**: Glass-panel field groups, better section headings
- **YAML mode**: Glass-panel code editor with monospace font, emerald syntax accent

#### Logs (`routes/logs.tsx`)
- **Log stream**: Glass-panel container. Level-colored left borders on each log line (emerald=info, amber=warn, red=error)
- **Filter bar**: Glass treatment, level filter badges with glow when active
- **Better monospace styling**: JetBrains Mono stack

### Phase 6: Micro-Interactions & Animation

1. **Route transitions**: Improve from 110ms to 200ms with better easing. Add subtle `translateY(6px)` → `0`.

2. **Card hover effects**: All cards get `transition-all duration-200 hover:translate-y-[-1px]` and shadow increase.

3. **Loading states**: Replace "Loading route..." text with skeleton layouts per page:
   - Dashboard: 4 skeleton stat cards + skeleton timeline
   - Chat: skeleton message list
   - etc.

4. **Status pulse**: Gateway health indicator and agent heartbeat dots get CSS pulse animation when connected/healthy.

5. **Focus transitions**: Inputs/buttons smoothly transition border-color and box-shadow on focus.

6. **Stagger children**: Page content fades in with staggered delay (50ms per item) for lists of cards.

### Phase 7: Typography Refinement

1. **Font stack**: Keep Space Grotesk for headings, add Inter (or system -apple-system stack) for body text. Add JetBrains Mono for code/logs/monospace.

2. **Heading hierarchy**: 
   - Page title: `text-lg font-bold tracking-tight`
   - Section title: `text-sm font-semibold uppercase tracking-wide text-emerald-200/80`
   - Card title: `text-sm font-semibold`
   - Body: `text-sm text-slate-300`
   - Muted: `text-xs text-slate-500`

3. **Metric displays**: Large numbers (dashboard stats) get `font-mono text-2xl font-bold` with optional neon-text treatment.

---

## Dependencies to Add

```bash
pnpm add lucide-react        # Icon library (matches Aikura)
pnpm add tailwindcss-animate  # Animation utilities for Radix
```

**Not needed** (Pinchy already has): tailwindcss, CVA, clsx, tailwind-merge, sonner, radix primitives, react-hook-form, zod

**Optional later**: `framer-motion` (if we want page transitions beyond CSS), `recharts` (for real charts replacing unicode sparklines)

---

## Implementation Order

| Step | Effort | Impact | Description |
|------|--------|--------|-------------|
| 1 | Small | High | **CSS foundation**: glass variables, grid background, utility classes |
| 2 | Small | High | **Tailwind config**: animate plugin, shadow/blur tokens |
| 3 | Medium | High | **Component upgrades**: Card, Button, Badge, Input glass treatments |
| 4 | Small | Medium | **Skeleton component** + loading states |
| 5 | Medium | High | **Layout glow-up**: Header, sidebar, main area |
| 6 | Small | Medium | **Lucide icons**: Replace inline SVGs |
| 7 | Medium | High | **Dashboard page**: Glass stat cards, glow indicators, timeline polish |
| 8 | Medium | Medium | **Chat page**: Glass bubbles, compose glow, tool sidebar |
| 9 | Small | Medium | **All other pages**: Apply glass/glow patterns consistently |
| 10 | Small | Medium | **Micro-interactions**: Hover lifts, stagger, pulse animations |

**Estimated total effort**: 2-4 hours for the full sweep. Steps 1-3 alone (1 hour) would transform the look dramatically.

---

## Design Principles (Borrowed from Aikura)

1. **Depth through glass**: Never flat opaque cards. Everything gets `backdrop-blur` + translucent bg + layered shadows.
2. **Emerald is the soul**: The accent color should glow, pulse, and highlight — not just tint backgrounds.
3. **Dark ≠ dead**: The background should have texture (grid), surfaces should have depth (multiple shadow layers).
4. **Hover = reward**: Every interactive element should respond to hover with lift, glow, or color shift.
5. **Typography creates hierarchy**: Use weight, size, tracking, and color to create 3-4 clear levels of text importance.
6. **Consistent icon language**: Same library, same size, same stroke weight everywhere.
