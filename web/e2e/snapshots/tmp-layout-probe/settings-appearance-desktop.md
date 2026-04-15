# Layout Analysis: settings-appearance
**Viewport:** desktop | **URL:** http://localhost:3000/settings/appearance
**Generated:** 2026-04-01T02:24:48.727Z

## Summary

### Warnings
- ⚠️ 14 buttons smaller than 44×44px (touch target size)
- ⚠️ 10 buttons with padding < 4px
- ⚠️ 13 flex/grid containers with size outliers (>10% deviation)

---

## Headings

| Level | Text | Size | Position |
|-------|------|------|----------|
| h1 | "Settings" | 960×32 @ (288, 24) | (288, 24) |

## Interactive Elements (Buttons/Links)

**Summary:** 29 total, 0 with overflow, 14 too small (<44px), 10 tiny padding (<4px)

### Buttons with Issues

| Index | Tag | Text | Size | Padding | Overflow |
|-------|-----|------|------|---------|----------|
| 0 | button | "Open navigation menu" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 1 | button | "Notifications" | 44×44 | 0/0/0/0 ⚠️ | None |
| 2 | button | "" | 44×44 | 0/0/0/0 ⚠️ | None |
| 12 | button | "Toggle theme" | 44×44 | 0/0/0/0 ⚠️ | None |
| 13 | a | "Appearance" | 113×32 ❌ | 8/12/8/12 | None |
| 14 | a | "Notifications" | 113×32 ❌ | 8/12/8/12 | None |
| 15 | a | "Security" | 91×32 ❌ | 8/12/8/12 | None |
| 16 | a | "Advanced" | 101×32 ❌ | 8/12/8/12 | None |
| 17 | a | "MCP Servers" | 119×32 ❌ | 8/12/8/12 | None |
| 18 | a | "Maintenance" | 117×32 ❌ | 8/12/8/12 | None |
| 19 | a | "Webhooks" | 104×32 ❌ | 8/12/8/12 | None |
| 23 | a | "Dashboard" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 24 | a | "Chat" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 25 | a | "Agents" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 26 | a | "Memories" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 27 | a | "Cron" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 28 | button | "More navigation options" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |

## Card-like Containers

**Summary:** 7 detected, 7 without title, 0 with inconsistent padding

| Index | Tag | Classes | Size | Has Title | Padding |
|-------|-----|---------|------|-----------|----------|
| 0 | div | border bg-card text-card-foreground | 256×900 @ (0, 0) | ❌ None | 0/0/0/0 |
| 1 | div | rounded-xl border bg-card | 960×217 @ (288, 160) | ❌ None | 0/0/0/0 |
| 2 | div | rounded-lg text-muted-foreground flex | 223×428 @ (16, 72) | ❌ None | 0/0/0/0 |
| 3 | span | inline-flex items-center gap-1.5 | 107×22 @ (16, 770) | ❌ None | 2/10/2/10 |
| 4 | button | justify-center whitespace-nowrap rounded-md | 293×101 @ (313, 251) | ❌ None | 16/8/16/8 |
| 5 | button | justify-center whitespace-nowrap rounded-md | 293×101 @ (622, 251) | ❌ None | 16/8/16/8 |
| 6 | button | justify-center whitespace-nowrap rounded-md | 293×101 @ (930, 251) | ❌ None | 16/8/16/8 |

## Flex/Grid Containers

**13 containers with sibling size outliers (>10% deviation):**

### div.flex.h-screen.overflow-hidden
- Display: flex
- Children: 3
- Max width deviation: 100.0%
- Max height deviation: 100.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 0 | button | 0×0 @ (0, 0) | W:-100% H:-100% |
| 1 | div | 256×900 @ (0, 0) | W:-60% H:0% |
| 2 | main | 1024×900 @ (256, 0) | W:60% H:0% |

### div.border.bg-card.text-card-foreground
- Display: flex
- Children: 3
- Max width deviation: 0.0%
- Max height deviation: 127.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 0 | div | 255×56 @ (0, 0) | W:0% H:-81% |
| 1 | div | 255×681 @ (0, 56) | W:0% H:127% |
| 2 | div | 255×163 @ (0, 737) | W:0% H:-46% |

### div.space-y-1.5.p-6.flex
- Display: flex
- Children: 2
- Max width deviation: 29.5%
- Max height deviation: 29.4%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 0 | div | 50×24 @ (16, 16) | W:-30% H:-29% |
| 1 | div | 92×44 @ (147, 9) | W:30% H:29% |

### div.flex.flex-col.items-stretch
- Display: flex
- Children: 4
- Max width deviation: 0.0%
- Max height deviation: 112.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 0 | div | 223×1 @ (16, 753) | W:0% H:-95% |
| 2 | div | 223×44 @ (16, 808) | W:0% H:112% |
| 3 | p | 223×16 @ (16, 868) | W:0% H:-23% |

### span.inline-flex.items-center.gap-1.5
- Display: flex
- Children: 2
- Max width deviation: 84.8%
- Max height deviation: 45.5%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 0 | span | 6×6 @ (27, 778) | W:-85% H:-45% |
| 1 | span | 73×16 @ (39, 773) | W:85% H:45% |

### button#radix-_r_f_.inline-flex.items-center.justify-center
- Display: flex
- Children: 2
- Max width deviation: 100.0%
- Max height deviation: 100.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 1 | svg | 0×0 @ (128, 830) | W:-100% H:-100% |

### nav.flex.gap-1.overflow-x-auto
- Display: flex
- Children: 7
- Max width deviation: 15.8%
- Max height deviation: 0.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 2 | a | 91×32 @ (522, 100) | W:-16% H:0% |

### a.inline-flex.items-center.justify-center
- Display: flex
- Children: 2
- Max width deviation: 60.4%
- Max height deviation: 0.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 0 | svg | 16×16 @ (300, 108) | W:-60% H:0% |
| 1 | span | 65×16 @ (324, 108) | W:60% H:0% |

### a.inline-flex.items-center.justify-center
- Display: flex
- Children: 2
- Max width deviation: 60.7%
- Max height deviation: 0.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 0 | svg | 16×16 @ (417, 108) | W:-61% H:0% |
| 1 | span | 65×16 @ (441, 108) | W:61% H:0% |

### a.inline-flex.items-center.justify-center
- Display: flex
- Children: 2
- Max width deviation: 46.1%
- Max height deviation: 0.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 0 | svg | 16×16 @ (534, 108) | W:-46% H:0% |
| 1 | span | 43×16 @ (558, 108) | W:46% H:0% |

## Invalid Nesting

*No invalid nesting detected*

## Text Collisions

*No text collisions detected*

---

## Raw Data (JSON)

```json
{
  "page": "settings-appearance",
  "viewport": "desktop",
  "timestamp": "2026-04-01T02:24:48.727Z",
  "url": "http://localhost:3000/settings/appearance",
  "title": "Pinchy - Agent Operations Console",
  "headings": [
    {
      "level": 1,
      "text": "Settings",
      "boundingBox": {
        "x": 288,
        "y": 24,
        "width": 960,
        "height": 32,
        "top": 24,
        "right": 1248,
        "bottom": 56,
        "left": 288
      },
      "tag": "h1",
      "classNames": [
        "text-2xl",
        "font-bold",
        "tracking-tight"
      ]
    }
  ],
  "buttons": [
    {
      "index": 0,
      "tag": "button",
      "text": "Open navigation menu",
      "classNames": [
        "inline-flex",
        "items-center",
        "justify-center",
        "gap-2",
        "whitespace-nowrap",
        "rounded-md",
        "text-sm",
        "font-medium",
        "transition-all",
        "duration-150",
        "focus-visible:outline-none",
        "focus-visible:ring-1",
        "focus-visible:ring-ring",
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "[&_svg]:pointer-events-none",
        "[&_svg]:size-4",
        "[&_svg]:shrink-0",
        "hover:bg-accent",
        "hover:text-accent-foreground",
        "h-11",
        "w-11",
        "fixed",
        "left-4",
        "top-4",
        "z-40",
        "lg:hidden"
      ],
      "boundingBox": {
        "x": 0,
        "y": 0,
        "width": 0,
        "height": 0,
        "top": 0,
        "right": 0,
        "bottom": 0,
        "left": 0
      },
      "computed": {
        "paddingTop": 0,
        "paddingRight": 0,
        "paddingBottom": 0,
        "paddingLeft": 0,
        "fontSize": 14,
        "lineHeight": 20,
        "scrollWidth": 0,
        "clientWidth": 0,
        "scrollHeight": 0,
        "clientHeight": 0
      },
      "hasOverflow": false,
      "overflowX": 0,
      "overflowY": 0,
      "parentTag": "div",
      "parentClass": "flex h-screen overflow-hidden"
    },
    {
      "index": 1,
      "tag": "button",
      "text": "Notifications",
      "classNames": [
        "inline-flex",
        "items-center",
        "justify-center",
        "gap-2",
        "whitespace-nowrap",
        "rounded-md",
        "text-sm",
        "font-medium",
        "transition-all",
        "duration-150",
        "focus-visible:outline-none",
        "focus-visible:ring-1",
        "focus-visible:ring-ring",
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "[&_svg]:pointer-events-none",
        "[&_svg]:size-4",
        "[&_svg]:shrink-0",
        "hover:bg-accent",
        "hover:text-accent-foreground",
        "h-11",
        "w-11",
        "relative"
      ],
      "boundingBox": {
        "x": 147,
        "y": 8.5,
        "width": 44,
        "height": 44,
        "top": 8.5,
        "right": 191,
        "bottom": 52.5,
        "left": 147
      },
      "computed": {
        "paddingTop": 0,
        "paddingRight": 0,
        "paddingBottom": 0,
        "paddingLeft": 0,
        "fontSize": 14,
        "lineHeight": 20,
        "scrollWidth": 44,
        "clientWidth": 44,
        "scrollHeight": 44,
        "clientHeight": 44
      },
      "hasOverflow": false,
      "overflowX": 0,
      "overflowY": 0,
      "parentTag": "div",
      "parentClass": "flex items-center gap-1"
    },
    {
      "index": 2,
      "tag": "button",
      "text": "",
      "classNames": [
        "inline-flex",
        "items-center",
        "justify-center",
        "whitespace-nowrap",
        "rounded-md",
        "text-sm",
        "font-medium",
        "transition-all",
        "duration-150",
        "focus-visible:outline-none",
        "focus-visible:ring-1",
        "focus-visible:ring-ring",
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "[&_svg]:pointer-events-none",
        "[&_svg]:size-4",
        "[&_svg]:shrink-0",
        "hover:bg-accent",
        "hover:text-accent-foreground",
        "h-11",
        "w-11",
        "gap-2"
      ],
      "boundingBox": {
        "x": 195,
        "y": 8.5,
        "width": 44,
        "height": 44,
        "top": 8.5,
        "right": 239,
        "bottom": 52.5,
        "left": 195
      },
      "computed": {
        "paddingTop": 0,
        "paddingRight": 0,
        "paddingBottom": 0,
        "paddingLeft": 0,
        "fontSize": 14,
        "lineHeight": 20,
        "scrollWidth": 44,
        "clientWidth": 44,
        "scrollHeight": 44,
        "clientHeight": 44
      },
      "hasOverflow": false,
      "overflowX": 0,
      "overflowY": 0,
      "parentTag": "div",
      "parentClass": "flex items-center gap-1"
    },
    {
      "index": 3,
      "tag": "a",
      "text": "Dashboard",
      "classNames": [
        "inline-flex",
        "items-center",
        "whitespace-nowrap",
        "rounded-md",
        "text-sm",
        "font-medium",
        "ring-offset-background",
        "transition-all",
        "duration-200",
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-ring",
        "focus-visible:ring-offset-2",
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "data-[state=active]:text-foreground",
        "w-full",
        "justify-start",
        "gap-3",
        "px-4",
        "py-2.5",
        "data-[state=active]:bg-secondary",
        "data-[state=active]:shadow-none"
      ],
      "boundingBox": {
        "x": 16,
        "y": 72,
        "width": 223,
        "height": 44,
        "top": 72,
        "right": 239,
        "bottom": 116,
        "left": 16
      },
      "computed": {
        "paddingTop": 10,
        "paddingRight": 16,
        "paddingBottom": 10,
        "paddingLeft": 16,
        "fontSize": 14,
        "lineHeight": 20,
        "scrollWidth": 223,
        "clientWidth": 223,
        "scrollHeight": 44,
        "clientHeight": 44
      },
      "hasOverflow": false,
      "overflowX": 0,
      "overflowY": 0,
      "parentTag": "div",
      "parentClass": "rounded-lg text-muted-foreground flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0"
    },
    {
      "index": 4,
      "tag": "a",
      "text": "Chat",
      "classNames": [
        "inline-flex",
        "items-center",
        "whitespace-nowrap",
        "rounded-md",
        "text-sm",
        "font-medium",
        "ring-offset-background",
        "transition-all",
        "duration-200",
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-ring",
        "focus-visible:ring-offset-2",
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "data-[state=active]:text-foreground",
        "w-full",
        "justify-start",
        "gap-3",
        "px-4",
        "py-2.5",
        "data-[state=active]:bg-secondary",
        "data-[state=active]:shadow-none"
      ],
      "boundingBox": {
        "x": 16,
        "y": 120,
        "width": 223,
        "height": 44,
        "top": 120,
        "right": 239,
        "bottom": 164,
        "left": 16
      },
      "computed": {
        "paddingTop": 10,
        "paddingRight": 16,
        "paddingBottom": 10,
        "paddingLeft": 16,
        "fontSize": 14,
        "lineHeight": 20,
        "scrollWidth": 223,
        "clientWidth": 223,
        "scrollHeight": 44,
        "clientHeight": 44
      },
      "hasOverflow": false,
      "overflowX": 0,
      "overflowY": 0,
      "parentTag": "div",
      "parentClass": "rounded-lg text-muted-foreground flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0"
    },
    {
      "index": 5,
      "tag": "a",
      "text": "Agents",
      "classNames": [
        "inline-flex",
        "items-center",
        "whitespace-nowrap",
        "rounded-md",
        "text-sm",
        "font-medium",
        "ring-offset-background",
        "transition-all",
        "duration-200",
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-ring",
        "focus-visible:ring-offset-2",
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "data-[state=active]:text-foreground",
        "w-full",
        "justify-start",
        "gap-3",
        "px-4",
        "py-2.5",
        "data-[state=active]:bg-secondary",
        "data-[state=active]:shadow-none"
      ],
      "boundingBox": {
        "x": 16,
        "y": 168,
        "width": 223,
        "height": 44,
        "top": 168,
        "right": 239,
        "bottom": 212,
        "left": 16
      },
      "computed": {
        "paddingTop": 10,
        "paddingRight": 16,
        "paddingBottom": 10,
        "paddingLeft": 16,
        "fontSize": 14,
        "lineHeight": 20,
        "scrollWidth": 223,
        "clientWidth": 223,
        "scrollHeight": 44,
        "clientHeight": 44
      },
      "hasOverflow": false,
      "overflowX": 0,
      "overflowY": 0,
      "parentTag": "div",
      "parentClass": "rounded-lg text-muted-foreground flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0"
    },
    {
      "index": 6,
      "tag": "a",
      "text": "Memories",
      "classNames": [
        "inline-flex",
        "items-center",
        "whitespace-nowrap",
        "rounded-md",
        "text-sm",
        "font-medium",
        "ring-offset-background",
        "transition-all",
        "duration-200",
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-ring",
        "focus-visible:ring-offset-2",
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "data-[state=active]:text-foreground",
        "w-full",
        "justify-start",
        "gap-3",
        "px-4",
        "py-2.5",
        "data-[state=active]:bg-secondary",
        "data-[state=active]:shadow-none"
      ],
      "boundingBox": {
        "x": 16,
        "y": 216,
        "width": 223,
        "height": 44,
        "top": 216,
        "right": 239,
        "bottom": 260,
        "left": 16
      },
      "computed": {
        "paddingTop": 10,
        "paddingRight": 16,
        "paddingBottom": 10,
        "paddingLeft": 16,
        "fontSize": 14,
        "lineHeight": 20,
        "scrollWidth": 223,
        "clientWidth": 223,
        "scrollHeight": 44,
        "clientHeight": 44
      },
      "hasOverflow": false,
      "overflowX": 0,
      "overflowY": 0,
      "parentTag": "div",
      "parentClass": "rounded-lg text-muted-foreground flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0"
    },
    {
      "index": 7,
      "tag": "a",
      "text": "Cron",
      "classNames": [
        "inline-flex",
        "items-center",
        "whitespace-nowrap",
        "rounded-md",
        "text-sm",
        "font-medium",
        "ring-offset-background",
        "transition-all",
        "duration-200",
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-ring",
        "focus-visible:ring-offset-2",
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "data-[state=active]:text-foreground",
        "w-full",
        "justify-start",
        "gap-3",
        "px-4",
        "py-2.5",
        "data-[state=active]:bg-secondary",
        "data-[state=active]:shadow-none"
      ],
      "boundingBox": {
        "x": 16,
        "y": 264,
        "width": 223,
        "height": 44,
        "top": 264,
        "right": 239,
        "bottom": 308,
        "left": 16
      },
      "computed": {
        "paddingTop": 10,
        "paddingRight": 16,
        "paddingBottom": 10,
        "paddingLeft": 16,
        "fontSize": 14,
        "lineHeight": 20,
        "scrollWidth": 223,
        "clientWidth": 223,
        "scrollHeight": 44,
        "clientHeight": 44
      },
      "hasOverflow": false,
      "overflowX": 0,
      "overflowY": 0,
      "parentTag": "div",
      "parentClass": "rounded-lg text-muted-foreground flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0"
    },
    {
      "index": 8,
      "tag": "a",
      "text": "Skills",
      "classNames": [
        "inline-flex",
        "items-center",
        "whitespace-nowrap",
        "rounded-md",
        "text-sm",
        "font-medium",
        "ring-offset-background",
        "transition-all",
        "duration-200",
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-ring",
        "focus-visible:ring-offset-2",
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "data-[state=active]:text-foreground",
        "w-full",
        "justify-start",
        "gap-3",
        "px-4",
        "py-2.5",
        "data-[state=active]:bg-secondary",
        "data-[state=active]:shadow-none"
      ],
      "boundingBox": {
        "x": 16,
        "y": 312,
        "width": 223,
        "height": 44,
        "top": 312,
        "right": 239,
        "bottom": 356,
        "left": 16
      },
      "computed": {
        "paddingTop": 10,
        "paddingRight": 16,
        "paddingBottom": 10,
        "paddingLeft": 16,
        "fontSize": 14,
        "lineHeight": 20,
        "scrollWidth": 223,
        "clientWidth": 223,
        "scrollHeight": 44,
        "clientHeight": 44
      },
      "hasOverflow": false,
      "overflowX": 0,
      "overflowY": 0,
      "parentTag": "div",
      "parentClass": "rounded-lg text-muted-foreground flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0"
    },
    {
      "index": 9,
      "tag": "a",
      "text": "Logs",
      "classNames": [
        "inline-flex",
        "items-center",
        "whitespace-nowrap",
        "rounded-md",
        "text-sm",
        "font-medium",
        "ring-offset-background",
        "transition-all",
        "duration-200",
        "focus-visible:outline-none",
        "focus-visible:ring-2",
        "focus-visible:ring-ring",
        "focus-visible:ring-offset-2",
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "data-[state=active]:text-foreground",
        "w-full",
        "justify-start",
        "gap-3",
        "px-4",
        "py-2.5",
        "data-[state=active]:bg-secondary",
        "data-[state=active]:shadow-none"
      ],
      "boundingBox": {
        "x": 16,
        "y": 360,
        "width": 223,
        "height": 44,
        "top": 360,
        "right": 239,
        "bottom": 404,
        "left": 16
      },
      "computed": {
        "paddingTop": 10,
        "paddingRight": 16,
        "paddingBottom": 10,
        "paddingLeft": 16,
        "fontSize": 14,
        "lineHeight": 20,
        "scrollWidth": 223,
        "clientWidth": 223,
        "scrollHeight": 44,
        "clientHeight": 44
      },
      "hasOverflow": false,
      "overflowX": 0,
      "overflowY": 0,
      "parentTag": "div",
      "parentClass": "rounded-lg text-muted-foreground flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0"
    }
  ],
  "buttonSummary": {
    "total": 29,
    "withOverflow": 0,
    "tooSmall": 14,
    "tinyPadding": 10
  },
  "cards": [
    {
      "index": 0,
      "tag": "div",
      "classNames": [
        "border",
        "bg-card",
        "text-card-foreground",
        "transition-shadow",
        "duration-200",
        "hidden",
        "lg:flex",
        "h-screen",
        "w-64",
        "flex-col",
        "sticky",
        "top-0",
        "rounded-none",
        "border-r",
        "border-y-0",
        "border-l-0",
        "shadow-none"
      ],
      "boundingBox": {
        "x": 0,
        "y": 0,
        "width": 256,
        "height": 900,
        "top": 0,
        "right": 256,
        "bottom": 900,
        "left": 0
      },
      "computed": {
        "paddingTop": 0,
        "paddingRight": 0,
        "paddingBottom": 0,
        "paddingLeft": 0,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 255,
        "clientWidth": 255,
        "scrollHeight": 900,
        "clientHeight": 900
      },
      "hasCardTitle": false,
      "childCount": 3
    },
    {
      "index": 1,
      "tag": "div",
      "classNames": [
        "rounded-xl",
        "border",
        "bg-card",
        "text-card-foreground",
        "shadow",
        "transition-shadow",
        "duration-200"
      ],
      "boundingBox": {
        "x": 288,
        "y": 160,
        "width": 960,
        "height": 217,
        "top": 160,
        "right": 1248,
        "bottom": 377,
        "left": 288
      },
      "computed": {
        "paddingTop": 0,
        "paddingRight": 0,
        "paddingBottom": 0,
        "paddingLeft": 0,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 958,
        "clientWidth": 958,
        "scrollHeight": 215,
        "clientHeight": 215
      },
      "hasCardTitle": false,
      "childCount": 2
    },
    {
      "index": 2,
      "tag": "div",
      "classNames": [
        "rounded-lg",
        "text-muted-foreground",
        "flex",
        "h-auto",
        "w-full",
        "flex-col",
        "items-stretch",
        "justify-start",
        "gap-1",
        "bg-transparent",
        "p-0"
      ],
      "boundingBox": {
        "x": 16,
        "y": 72,
        "width": 223,
        "height": 428,
        "top": 72,
        "right": 239,
        "bottom": 500,
        "left": 16
      },
      "computed": {
        "paddingTop": 0,
        "paddingRight": 0,
        "paddingBottom": 0,
        "paddingLeft": 0,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 223,
        "clientWidth": 223,
        "scrollHeight": 428,
        "clientHeight": 428
      },
      "hasCardTitle": false,
      "childCount": 9
    },
    {
      "index": 3,
      "tag": "span",
      "classNames": [
        "inline-flex",
        "items-center",
        "gap-1.5",
        "rounded-full",
        "border",
        "px-2.5",
        "py-0.5",
        "text-xs",
        "font-medium",
        "transition-colors",
        "focus:outline-none",
        "focus:ring-2",
        "focus:ring-ring",
        "focus:ring-offset-2",
        "border-slate-500/20",
        "bg-slate-100",
        "text-slate-700",
        "dark:border-slate-500/30",
        "dark:bg-slate-500/10",
        "dark:text-slate-400"
      ],
      "boundingBox": {
        "x": 16,
        "y": 770,
        "width": 106.71875,
        "height": 22,
        "top": 770,
        "right": 122.71875,
        "bottom": 792,
        "left": 16
      },
      "computed": {
        "paddingTop": 2,
        "paddingRight": 10,
        "paddingBottom": 2,
        "paddingLeft": 10,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 105,
        "clientWidth": 105,
        "scrollHeight": 20,
        "clientHeight": 20
      },
      "hasCardTitle": false,
      "childCount": 2
    },
    {
      "index": 4,
      "tag": "button",
      "classNames": [
        "justify-center",
        "whitespace-nowrap",
        "rounded-md",
        "text-sm",
        "font-medium",
        "transition-all",
        "duration-150",
        "focus-visible:outline-none",
        "focus-visible:ring-1",
        "focus-visible:ring-ring",
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "[&_svg]:pointer-events-none",
        "[&_svg]:size-4",
        "[&_svg]:shrink-0",
        "border",
        "border-input",
        "bg-background",
        "shadow-sm",
        "hover:bg-accent",
        "hover:text-accent-foreground",
        "flex",
        "flex-col",
        "items-center",
        "gap-2",
        "h-auto",
        "py-4",
        "px-2"
      ],
      "boundingBox": {
        "x": 313,
        "y": 251,
        "width": 292.65625,
        "height": 101,
        "top": 251,
        "right": 605.65625,
        "bottom": 352,
        "left": 313
      },
      "computed": {
        "paddingTop": 16,
        "paddingRight": 8,
        "paddingBottom": 16,
        "paddingLeft": 8,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 291,
        "clientWidth": 291,
        "scrollHeight": 99,
        "clientHeight": 99
      },
      "hasCardTitle": false,
      "childCount": 3
    },
    {
      "index": 5,
      "tag": "button",
      "classNames": [
        "justify-center",
        "whitespace-nowrap",
        "rounded-md",
        "text-sm",
        "font-medium",
        "transition-all",
        "duration-150",
        "focus-visible:outline-none",
        "focus-visible:ring-1",
        "focus-visible:ring-ring",
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "[&_svg]:pointer-events-none",
        "[&_svg]:size-4",
        "[&_svg]:shrink-0",
        "border",
        "border-input",
        "bg-background",
        "shadow-sm",
        "hover:bg-accent",
        "hover:text-accent-foreground",
        "flex",
        "flex-col",
        "items-center",
        "gap-2",
        "h-auto",
        "py-4",
        "px-2"
      ],
      "boundingBox": {
        "x": 621.65625,
        "y": 251,
        "width": 292.671875,
        "height": 101,
        "top": 251,
        "right": 914.328125,
        "bottom": 352,
        "left": 621.65625
      },
      "computed": {
        "paddingTop": 16,
        "paddingRight": 8,
        "paddingBottom": 16,
        "paddingLeft": 8,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 291,
        "clientWidth": 291,
        "scrollHeight": 99,
        "clientHeight": 99
      },
      "hasCardTitle": false,
      "childCount": 3
    },
    {
      "index": 6,
      "tag": "button",
      "classNames": [
        "justify-center",
        "whitespace-nowrap",
        "rounded-md",
        "text-sm",
        "font-medium",
        "transition-all",
        "duration-150",
        "focus-visible:outline-none",
        "focus-visible:ring-1",
        "focus-visible:ring-ring",
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "[&_svg]:pointer-events-none",
        "[&_svg]:size-4",
        "[&_svg]:shrink-0",
        "border",
        "shadow-sm",
        "hover:bg-accent",
        "hover:text-accent-foreground",
        "flex",
        "flex-col",
        "items-center",
        "gap-2",
        "h-auto",
        "py-4",
        "px-2",
        "border-primary",
        "bg-accent"
      ],
      "boundingBox": {
        "x": 930.328125,
        "y": 251,
        "width": 292.65625,
        "height": 101,
        "top": 251,
        "right": 1222.984375,
        "bottom": 352,
        "left": 930.328125
      },
      "computed": {
        "paddingTop": 16,
        "paddingRight": 8,
        "paddingBottom": 16,
        "paddingLeft": 8,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 291,
        "clientWidth": 291,
        "scrollHeight": 99,
        "clientHeight": 99
      },
      "hasCardTitle": false,
      "childCount": 3
    }
  ],
  "cardSummary": {
    "total": 7,
    "withoutTitle": 7,
    "inconsistentPadding": 0
  },
  "containers": [
    {
      "selector": "div.flex.h-screen.overflow-hidden",
      "tag": "div",
      "classNames": [
        "flex",
        "h-screen",
        "overflow-hidden"
      ],
      "display": "flex",
      "childCount": 3,
      "children": [
        {
          "index": 0,
          "tag": "button",
          "classNames": [
            "inline-flex",
            "items-center",
            "justify-center",
            "gap-2",
            "whitespace-nowrap",
            "rounded-md",
            "text-sm",
            "font-medium",
            "transition-all",
            "duration-150",
            "focus-visible:outline-none",
            "focus-visible:ring-1",
            "focus-visible:ring-ring",
            "disabled:pointer-events-none",
            "disabled:opacity-50",
            "[&_svg]:pointer-events-none",
            "[&_svg]:size-4",
            "[&_svg]:shrink-0",
            "hover:bg-accent",
            "hover:text-accent-foreground",
            "h-11",
            "w-11",
            "fixed",
            "left-4",
            "top-4",
            "z-40",
            "lg:hidden"
          ],
          "boundingBox": {
            "x": 0,
            "y": 0,
            "width": 0,
            "height": 0,
            "top": 0,
            "right": 0,
            "bottom": 0,
            "left": 0
          },
          "widthRatio": 0,
          "heightRatio": 0,
          "isOutlier": true
        },
        {
          "index": 1,
          "tag": "div",
          "classNames": [
            "border",
            "bg-card",
            "text-card-foreground",
            "transition-shadow",
            "duration-200",
            "hidden",
            "lg:flex",
            "h-screen",
            "w-64",
            "flex-col",
            "sticky",
            "top-0",
            "rounded-none",
            "border-r",
            "border-y-0",
            "border-l-0",
            "shadow-none"
          ],
          "boundingBox": {
            "x": 0,
            "y": 0,
            "width": 256,
            "height": 900,
            "top": 0,
            "right": 256,
            "bottom": 900,
            "left": 0
          },
          "widthRatio": 0.4,
          "heightRatio": 1,
          "isOutlier": true
        },
        {
          "index": 2,
          "tag": "main",
          "classNames": [
            "flex-1",
            "overflow-auto"
          ],
          "boundingBox": {
            "x": 256,
            "y": 0,
            "width": 1024,
            "height": 900,
            "top": 0,
            "right": 1280,
            "bottom": 900,
            "left": 256
          },
          "widthRatio": 1.6,
          "heightRatio": 1,
          "isOutlier": true
        }
      ],
      "hasOutliers": true,
      "maxWidthDeviation": 1,
      "maxHeightDeviation": 1
    },
    {
      "selector": "div.border.bg-card.text-card-foreground",
      "tag": "div",
      "classNames": [
        "border",
        "bg-card",
        "text-card-foreground",
        "transition-shadow",
        "duration-200"
      ],
      "display": "flex",
      "childCount": 3,
      "children": [
        {
          "index": 0,
          "tag": "div",
          "classNames": [
            "space-y-1.5",
            "p-6",
            "flex",
            "h-14",
            "flex-row",
            "items-center",
            "justify-between",
            "border-b",
            "px-4",
            "py-0"
          ],
          "boundingBox": {
            "x": 0,
            "y": 0,
            "width": 255,
            "height": 56,
            "top": 0,
            "right": 255,
            "bottom": 56,
            "left": 0
          },
          "widthRatio": 1,
          "heightRatio": 0.18666666666666668,
          "isOutlier": true
        },
        {
          "index": 1,
          "tag": "div",
          "classNames": [
            "flex-1",
            "overflow-hidden",
            "p-0"
          ],
          "boundingBox": {
            "x": 0,
            "y": 56,
            "width": 255,
            "height": 681,
            "top": 56,
            "right": 255,
            "bottom": 737,
            "left": 0
          },
          "widthRatio": 1,
          "heightRatio": 2.27,
          "isOutlier": true
        },
        {
          "index": 2,
          "tag": "div",
          "classNames": [
            "flex",
            "flex-col",
            "items-stretch",
            "gap-4",
            "p-4"
          ],
          "boundingBox": {
            "x": 0,
            "y": 737,
            "width": 255,
            "height": 163,
            "top": 737,
            "right": 255,
            "bottom": 900,
            "left": 0
          },
          "widthRatio": 1,
          "heightRatio": 0.5433333333333333,
          "isOutlier": true
        }
      ],
      "hasOutliers": true,
      "maxWidthDeviation": 0,
      "maxHeightDeviation": 1.27
    },
    {
      "selector": "div.space-y-1.5.p-6.flex",
      "tag": "div",
      "classNames": [
        "space-y-1.5",
        "p-6",
        "flex",
        "h-14",
        "flex-row"
      ],
      "display": "flex",
      "childCount": 2,
      "children": [
        {
          "index": 0,
          "tag": "div",
          "classNames": [
            "tracking-tight",
            "text-base",
            "font-semibold"
          ],
          "boundingBox": {
            "x": 16,
            "y": 15.5,
            "width": 50.0625,
            "height": 24,
            "top": 15.5,
            "right": 66.0625,
            "bottom": 39.5,
            "left": 16
          },
          "widthRatio": 0.7047954245490541,
          "heightRatio": 0.7058823529411765,
          "isOutlier": true
        },
        {
          "index": 1,
          "tag": "div",
          "classNames": [
            "flex",
            "items-center",
            "gap-1"
          ],
          "boundingBox": {
            "x": 147,
            "y": 8.5,
            "width": 92,
            "height": 44,
            "top": 8.5,
            "right": 239,
            "bottom": 52.5,
            "left": 147
          },
          "widthRatio": 1.2952045754509458,
          "heightRatio": 1.2941176470588236,
          "isOutlier": true
        }
      ],
      "hasOutliers": true,
      "maxWidthDeviation": 0.2952045754509459,
      "maxHeightDeviation": 0.2941176470588236
    },
    {
      "selector": "div.flex.items-center.gap-1",
      "tag": "div",
      "classNames": [
        "flex",
        "items-center",
        "gap-1"
      ],
      "display": "flex",
      "childCount": 2,
      "children": [
        {
          "index": 0,
          "tag": "button",
          "classNames": [
            "inline-flex",
            "items-center",
            "justify-center",
            "gap-2",
            "whitespace-nowrap",
            "rounded-md",
            "text-sm",
            "font-medium",
            "transition-all",
            "duration-150",
            "focus-visible:outline-none",
            "focus-visible:ring-1",
            "focus-visible:ring-ring",
            "disabled:pointer-events-none",
            "disabled:opacity-50",
            "[&_svg]:pointer-events-none",
            "[&_svg]:size-4",
            "[&_svg]:shrink-0",
            "hover:bg-accent",
            "hover:text-accent-foreground",
            "h-11",
            "w-11",
            "relative"
          ],
          "boundingBox": {
            "x": 147,
            "y": 8.5,
            "width": 44,
            "height": 44,
            "top": 8.5,
            "right": 191,
            "bottom": 52.5,
            "left": 147
          },
          "widthRatio": 1,
          "heightRatio": 1,
          "isOutlier": false
        },
        {
          "index": 1,
          "tag": "button",
          "classNames": [
            "inline-flex",
            "items-center",
            "justify-center",
            "whitespace-nowrap",
            "rounded-md",
            "text-sm",
            "font-medium",
            "transition-all",
            "duration-150",
            "focus-visible:outline-none",
            "focus-visible:ring-1",
            "focus-visible:ring-ring",
            "disabled:pointer-events-none",
            "disabled:opacity-50",
            "[&_svg]:pointer-events-none",
            "[&_svg]:size-4",
            "[&_svg]:shrink-0",
            "hover:bg-accent",
            "hover:text-accent-foreground",
            "h-11",
            "w-11",
            "gap-2"
          ],
          "boundingBox": {
            "x": 195,
            "y": 8.5,
            "width": 44,
            "height": 44,
            "top": 8.5,
            "right": 239,
            "bottom": 52.5,
            "left": 195
          },
          "widthRatio": 1,
          "heightRatio": 1,
          "isOutlier": false
        }
      ],
      "hasOutliers": false,
      "maxWidthDeviation": 0,
      "maxHeightDeviation": 0
    },
    {
      "selector": "button.inline-flex.items-center.justify-center",
      "tag": "button",
      "classNames": [
        "inline-flex",
        "items-center",
        "justify-center",
        "gap-2",
        "whitespace-nowrap"
      ],
      "display": "flex",
      "childCount": 1,
      "children": [
        {
          "index": 0,
          "tag": "svg",
          "classNames": [
            "lucide",
            "lucide-bell",
            "h-5",
            "w-5"
          ],
          "boundingBox": {
            "x": 161,
            "y": 22.5,
            "width": 16,
            "height": 16,
            "top": 22.5,
            "right": 177,
            "bottom": 38.5,
            "left": 161
          },
          "widthRatio": 1,
          "heightRatio": 1,
          "isOutlier": false
        }
      ],
      "hasOutliers": false,
      "maxWidthDeviation": 0,
      "maxHeightDeviation": 0
    }
  ],
  "invalidNesting": [],
  "textCollisions": [],
  "criticalIssues": [],
  "warnings": [
    "14 buttons smaller than 44×44px (touch target size)",
    "10 buttons with padding < 4px",
    "13 flex/grid containers with size outliers (>10% deviation)"
  ]
}
```