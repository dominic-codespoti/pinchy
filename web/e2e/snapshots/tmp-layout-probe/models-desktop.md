# Layout Analysis: models
**Viewport:** desktop | **URL:** http://localhost:3000/models
**Generated:** 2026-04-01T02:24:54.123Z

## Summary

### Warnings
- ⚠️ 11 buttons smaller than 44×44px (touch target size)
- ⚠️ 14 buttons with padding < 4px
- ⚠️ 8 flex/grid containers with size outliers (>10% deviation)

---

## Headings

| Level | Text | Size | Position |
|-------|------|------|----------|
| h1 | "Models" | 960×32 @ (288, 24) | (288, 24) |
| h2 | "Default Model" | 910×20 @ (313, 105) | (313, 105) |
| h2 | "Connected Providers" | 231×20 @ (313, 327) | (313, 327) |

## Interactive Elements (Buttons/Links)

**Summary:** 26 total, 0 with overflow, 11 too small (<44px), 14 tiny padding (<4px)

### Buttons with Issues

| Index | Tag | Text | Size | Padding | Overflow |
|-------|-----|------|------|---------|----------|
| 0 | button | "Open navigation menu" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 1 | button | "Notifications" | 44×44 | 0/0/0/0 ⚠️ | None |
| 2 | button | "" | 44×44 | 0/0/0/0 ⚠️ | None |
| 12 | button | "Toggle theme" | 44×44 | 0/0/0/0 ⚠️ | None |
| 14 | button | "copilotNo models loaded" | 804×36 ❌ | 0/0/0/0 ⚠️ | None |
| 15 | button | "" | 32×32 ❌ | 0/0/0/0 ⚠️ | None |
| 16 | button | "anthropicNo models loaded" | 804×36 ❌ | 0/0/0/0 ⚠️ | None |
| 17 | button | "" | 32×32 ❌ | 0/0/0/0 ⚠️ | None |
| 20 | a | "Dashboard" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 21 | a | "Chat" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 22 | a | "Agents" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 23 | a | "Memories" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 24 | a | "Cron" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 25 | button | "More navigation options" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |

## Card-like Containers

**Summary:** 11 detected, 9 without title, 0 with inconsistent padding

| Index | Tag | Classes | Size | Has Title | Padding |
|-------|-----|---------|------|-----------|----------|
| 0 | div | border bg-card text-card-foreground | 256×900 @ (0, 0) | ❌ None | 0/0/0/0 |
| 1 | div | rounded-xl border bg-card | 960×198 @ (288, 80) | ✅ "Default Model" | 0/0/0/0 |
| 2 | button | inline-flex items-center justify-center | 910×78 @ (313, 175) | ❌ None | 16/16/16/16 |
| 3 | div | rounded-xl border bg-card | 960×250 @ (288, 302) | ✅ "Connected Providers" | 0/0/0/0 |
| 4 | div | flex items-center gap-3 | 910×70 @ (313, 375) | ❌ None | 16/16/16/16 |
| 5 | div | flex items-center gap-3 | 910×70 @ (313, 457) | ❌ None | 16/16/16/16 |
| 6 | div | rounded-lg text-muted-foreground flex | 223×428 @ (16, 72) | ❌ None | 0/0/0/0 |
| 7 | span | inline-flex items-center gap-1.5 | 107×22 @ (16, 770) | ❌ None | 2/10/2/10 |
| 8 | div | inline-flex items-center rounded-md | 29×22 @ (1194, 336) | ❌ None | 2/10/2/10 |
| 9 | button | inline-flex items-center justify-center | 147×44 @ (288, 576) | ❌ None | 8/16/8/16 |
| 10 | button | inline-flex items-center justify-center | 160×44 @ (447, 576) | ❌ None | 8/16/8/16 |

## Flex/Grid Containers

**8 containers with sibling size outliers (>10% deviation):**

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

### div.flex.flex-col.items-center
- Display: flex
- Children: 2
- Max width deviation: 79.3%
- Max height deviation: 11.1%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 0 | svg | 16×16 @ (760, 192) | W:-79% H:-11% |
| 1 | p | 139×20 @ (699, 216) | W:79% H:11% |

### div.p-6.flex.flex-row
- Display: flex
- Children: 2
- Max width deviation: 77.9%
- Max height deviation: 29.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 0 | div | 231×40 @ (313, 327) | W:78% H:29% |
| 1 | div | 29×22 @ (1194, 336) | W:-78% H:-29% |

## Invalid Nesting

*No invalid nesting detected*

## Text Collisions

*No text collisions detected*

---

## Raw Data (JSON)

```json
{
  "page": "models",
  "viewport": "desktop",
  "timestamp": "2026-04-01T02:24:54.123Z",
  "url": "http://localhost:3000/models",
  "title": "Pinchy - Agent Operations Console",
  "headings": [
    {
      "level": 1,
      "text": "Models",
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
    },
    {
      "level": 2,
      "text": "Default Model",
      "boundingBox": {
        "x": 313,
        "y": 105,
        "width": 910,
        "height": 20,
        "top": 105,
        "right": 1223,
        "bottom": 125,
        "left": 313
      },
      "tag": "h2",
      "classNames": [
        "font-semibold",
        "leading-none",
        "tracking-tight",
        "flex",
        "items-center",
        "gap-2"
      ]
    },
    {
      "level": 2,
      "text": "Connected Providers",
      "boundingBox": {
        "x": 313,
        "y": 327,
        "width": 231.140625,
        "height": 20,
        "top": 327,
        "right": 544.140625,
        "bottom": 347,
        "left": 313
      },
      "tag": "h2",
      "classNames": [
        "font-semibold",
        "leading-none",
        "tracking-tight",
        "flex",
        "items-center",
        "gap-2"
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
    "total": 26,
    "withOverflow": 0,
    "tooSmall": 11,
    "tinyPadding": 14
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
        "y": 80,
        "width": 960,
        "height": 198,
        "top": 80,
        "right": 1248,
        "bottom": 278,
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
        "scrollHeight": 196,
        "clientHeight": 196
      },
      "hasCardTitle": true,
      "titleText": "Default Model",
      "titleTag": "h2",
      "childCount": 2
    },
    {
      "index": 2,
      "tag": "button",
      "classNames": [
        "inline-flex",
        "items-center",
        "justify-center",
        "gap-2",
        "whitespace-nowrap",
        "text-sm",
        "font-medium",
        "duration-150",
        "focus-visible:outline-none",
        "focus-visible:ring-1",
        "focus-visible:ring-ring",
        "disabled:pointer-events-none",
        "disabled:opacity-50",
        "[&_svg]:pointer-events-none",
        "[&_svg]:size-4",
        "[&_svg]:shrink-0",
        "hover:text-accent-foreground",
        "h-auto",
        "w-full",
        "p-4",
        "rounded-lg",
        "border",
        "border-dashed",
        "bg-card",
        "hover:bg-accent/50",
        "transition-colors"
      ],
      "boundingBox": {
        "x": 313,
        "y": 175,
        "width": 910,
        "height": 78,
        "top": 175,
        "right": 1223,
        "bottom": 253,
        "left": 313
      },
      "computed": {
        "paddingTop": 16,
        "paddingRight": 16,
        "paddingBottom": 16,
        "paddingLeft": 16,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 908,
        "clientWidth": 908,
        "scrollHeight": 76,
        "clientHeight": 76
      },
      "hasCardTitle": false,
      "childCount": 1
    },
    {
      "index": 3,
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
        "y": 302,
        "width": 960,
        "height": 250,
        "top": 302,
        "right": 1248,
        "bottom": 552,
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
        "scrollHeight": 248,
        "clientHeight": 248
      },
      "hasCardTitle": true,
      "titleText": "Connected Providers",
      "titleTag": "h2",
      "childCount": 2
    },
    {
      "index": 4,
      "tag": "div",
      "classNames": [
        "flex",
        "items-center",
        "gap-3",
        "w-full",
        "p-4",
        "rounded-lg",
        "border",
        "bg-card"
      ],
      "boundingBox": {
        "x": 313,
        "y": 375,
        "width": 910,
        "height": 70,
        "top": 375,
        "right": 1223,
        "bottom": 445,
        "left": 313
      },
      "computed": {
        "paddingTop": 16,
        "paddingRight": 16,
        "paddingBottom": 16,
        "paddingLeft": 16,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 908,
        "clientWidth": 908,
        "scrollHeight": 68,
        "clientHeight": 68
      },
      "hasCardTitle": false,
      "childCount": 3
    },
    {
      "index": 5,
      "tag": "div",
      "classNames": [
        "flex",
        "items-center",
        "gap-3",
        "w-full",
        "p-4",
        "rounded-lg",
        "border",
        "bg-card"
      ],
      "boundingBox": {
        "x": 313,
        "y": 457,
        "width": 910,
        "height": 70,
        "top": 457,
        "right": 1223,
        "bottom": 527,
        "left": 313
      },
      "computed": {
        "paddingTop": 16,
        "paddingRight": 16,
        "paddingBottom": 16,
        "paddingLeft": 16,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 908,
        "clientWidth": 908,
        "scrollHeight": 68,
        "clientHeight": 68
      },
      "hasCardTitle": false,
      "childCount": 3
    },
    {
      "index": 6,
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
      "index": 7,
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
      "index": 8,
      "tag": "div",
      "classNames": [
        "inline-flex",
        "items-center",
        "rounded-md",
        "border",
        "px-2.5",
        "py-0.5",
        "text-xs",
        "font-semibold",
        "transition-all",
        "duration-150",
        "focus:outline-none",
        "focus:ring-2",
        "focus:ring-ring",
        "focus:ring-offset-2",
        "border-transparent",
        "bg-secondary",
        "text-secondary-foreground",
        "hover:bg-secondary/80"
      ],
      "boundingBox": {
        "x": 1194.3125,
        "y": 336,
        "width": 28.6875,
        "height": 22,
        "top": 336,
        "right": 1223,
        "bottom": 358,
        "left": 1194.3125
      },
      "computed": {
        "paddingTop": 2,
        "paddingRight": 10,
        "paddingBottom": 2,
        "paddingLeft": 10,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 27,
        "clientWidth": 27,
        "scrollHeight": 20,
        "clientHeight": 20
      },
      "hasCardTitle": false,
      "childCount": 0
    },
    {
      "index": 9,
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
        "border",
        "border-input",
        "bg-background",
        "shadow-sm",
        "hover:bg-accent",
        "hover:text-accent-foreground",
        "h-11",
        "px-4",
        "py-2"
      ],
      "boundingBox": {
        "x": 288,
        "y": 576,
        "width": 146.9375,
        "height": 44,
        "top": 576,
        "right": 434.9375,
        "bottom": 620,
        "left": 288
      },
      "computed": {
        "paddingTop": 8,
        "paddingRight": 16,
        "paddingBottom": 8,
        "paddingLeft": 16,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 145,
        "clientWidth": 145,
        "scrollHeight": 42,
        "clientHeight": 42
      },
      "hasCardTitle": false,
      "childCount": 1
    }
  ],
  "cardSummary": {
    "total": 11,
    "withoutTitle": 9,
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
    "11 buttons smaller than 44×44px (touch target size)",
    "14 buttons with padding < 4px",
    "8 flex/grid containers with size outliers (>10% deviation)"
  ]
}
```