# Layout Analysis: models
**Viewport:** mobile | **URL:** http://localhost:3000/models
**Generated:** 2026-04-01T02:24:56.790Z

## Summary

### Warnings
- ⚠️ 16 buttons smaller than 44×44px (touch target size)
- ⚠️ 14 buttons with padding < 4px
- ⚠️ 4 flex/grid containers with size outliers (>10% deviation)

---

## Headings

| Level | Text | Size | Position |
|-------|------|------|----------|
| h1 | "Models" | 343×32 @ (16, 24) | (16, 24) |
| h2 | "Default Model" | 293×20 @ (41, 105) | (41, 105) |
| h2 | "Connected Providers" | 231×20 @ (41, 347) | (41, 347) |

## Interactive Elements (Buttons/Links)

**Summary:** 26 total, 0 with overflow, 16 too small (<44px), 14 tiny padding (<4px)

### Buttons with Issues

| Index | Tag | Text | Size | Padding | Overflow |
|-------|-----|------|------|---------|----------|
| 0 | button | "Open navigation menu" | 44×44 | 0/0/0/0 ⚠️ | None |
| 1 | button | "Notifications" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 2 | button | "" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 3 | a | "" | 0×0 ❌ | 10/16/10/16 | None |
| 4 | a | "" | 0×0 ❌ | 10/16/10/16 | None |
| 5 | a | "" | 0×0 ❌ | 10/16/10/16 | None |
| 6 | a | "" | 0×0 ❌ | 10/16/10/16 | None |
| 7 | a | "" | 0×0 ❌ | 10/16/10/16 | None |
| 8 | a | "" | 0×0 ❌ | 10/16/10/16 | None |
| 9 | a | "" | 0×0 ❌ | 10/16/10/16 | None |
| 10 | a | "" | 0×0 ❌ | 10/16/10/16 | None |
| 11 | a | "" | 0×0 ❌ | 10/16/10/16 | None |
| 12 | button | "Toggle theme" | 0×0 ❌ | 0/0/0/0 ⚠️ | None |
| 14 | button | "copilotNo models loaded" | 187×36 ❌ | 0/0/0/0 ⚠️ | None |
| 15 | button | "" | 32×32 ❌ | 0/0/0/0 ⚠️ | None |
| 16 | button | "anthropicNo models loaded" | 187×36 ❌ | 0/0/0/0 ⚠️ | None |
| 17 | button | "" | 32×32 ❌ | 0/0/0/0 ⚠️ | None |
| 20 | a | "Dashboard" | 59×63 | 0/0/0/0 ⚠️ | None |
| 21 | a | "Chat" | 59×63 | 0/0/0/0 ⚠️ | None |
| 22 | a | "Agents" | 59×63 | 0/0/0/0 ⚠️ | None |
| ... | ... | (3 more) | ... | ... | ... |

## Card-like Containers

**Summary:** 11 detected, 9 without title, 0 with inconsistent padding

| Index | Tag | Classes | Size | Has Title | Padding |
|-------|-----|---------|------|-----------|----------|
| 0 | div | border bg-card text-card-foreground | 0×0 @ (0, 0) | ❌ None | 0/0/0/0 |
| 1 | div | rounded-xl border bg-card | 343×218 @ (16, 80) | ✅ "Default Model" | 0/0/0/0 |
| 2 | button | inline-flex items-center justify-center | 293×78 @ (41, 195) | ❌ None | 16/16/16/16 |
| 3 | div | rounded-xl border bg-card | 343×250 @ (16, 322) | ✅ "Connected Providers" | 0/0/0/0 |
| 4 | div | flex items-center gap-3 | 293×70 @ (41, 395) | ❌ None | 16/16/16/16 |
| 5 | div | flex items-center gap-3 | 293×70 @ (41, 477) | ❌ None | 16/16/16/16 |
| 6 | div | rounded-lg text-muted-foreground flex | 0×0 @ (0, 0) | ❌ None | 0/0/0/0 |
| 7 | span | inline-flex items-center gap-1.5 | 0×0 @ (0, 0) | ❌ None | 2/10/2/10 |
| 8 | div | inline-flex items-center rounded-md | 29×22 @ (305, 356) | ❌ None | 2/10/2/10 |
| 9 | button | inline-flex items-center justify-center | 147×44 @ (16, 596) | ❌ None | 8/16/8/16 |
| 10 | button | inline-flex items-center justify-center | 160×44 @ (175, 596) | ❌ None | 8/16/8/16 |

## Flex/Grid Containers

**4 containers with sibling size outliers (>10% deviation):**

### div.flex.h-screen.overflow-hidden
- Display: flex
- Children: 3
- Max width deviation: 100.0%
- Max height deviation: 100.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 0 | button | 44×44 @ (16, 16) | W:-79% H:-90% |
| 1 | div | 0×0 @ (0, 0) | W:-100% H:-100% |
| 2 | main | 375×812 @ (0, 0) | W:79% H:90% |

### div.flex.flex-col.space-y-1.5
- Display: flex
- Children: 2
- Max width deviation: 0.0%
- Max height deviation: 33.3%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 0 | h2 | 293×20 @ (41, 105) | W:0% H:-33% |
| 1 | div | 293×40 @ (41, 131) | W:0% H:33% |

### div.flex.flex-col.items-center
- Display: flex
- Children: 2
- Max width deviation: 79.3%
- Max height deviation: 11.1%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 0 | svg | 16×16 @ (180, 212) | W:-79% H:-11% |
| 1 | p | 139×20 @ (118, 236) | W:79% H:11% |

### div.p-6.flex.flex-row
- Display: flex
- Children: 2
- Max width deviation: 77.9%
- Max height deviation: 29.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 0 | div | 231×40 @ (41, 347) | W:78% H:29% |
| 1 | div | 29×22 @ (305, 356) | W:-78% H:-29% |

## Invalid Nesting

*No invalid nesting detected*

## Text Collisions

*No text collisions detected*

---

## Raw Data (JSON)

```json
{
  "page": "models",
  "viewport": "mobile",
  "timestamp": "2026-04-01T02:24:56.790Z",
  "url": "http://localhost:3000/models",
  "title": "Pinchy - Agent Operations Console",
  "headings": [
    {
      "level": 1,
      "text": "Models",
      "boundingBox": {
        "x": 16,
        "y": 24,
        "width": 343,
        "height": 32,
        "top": 24,
        "right": 359,
        "bottom": 56,
        "left": 16
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
        "x": 41,
        "y": 105,
        "width": 293,
        "height": 20,
        "top": 105,
        "right": 334,
        "bottom": 125,
        "left": 41
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
        "x": 41,
        "y": 347,
        "width": 231.140625,
        "height": 20,
        "top": 347,
        "right": 272.140625,
        "bottom": 367,
        "left": 41
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
        "x": 16,
        "y": 16,
        "width": 44,
        "height": 44,
        "top": 16,
        "right": 60,
        "bottom": 60,
        "left": 16
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
      "parentClass": "flex items-center gap-1"
    },
    {
      "index": 3,
      "tag": "a",
      "text": "",
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
        "paddingTop": 10,
        "paddingRight": 16,
        "paddingBottom": 10,
        "paddingLeft": 16,
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
      "parentClass": "rounded-lg text-muted-foreground flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0"
    },
    {
      "index": 4,
      "tag": "a",
      "text": "",
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
        "paddingTop": 10,
        "paddingRight": 16,
        "paddingBottom": 10,
        "paddingLeft": 16,
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
      "parentClass": "rounded-lg text-muted-foreground flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0"
    },
    {
      "index": 5,
      "tag": "a",
      "text": "",
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
        "paddingTop": 10,
        "paddingRight": 16,
        "paddingBottom": 10,
        "paddingLeft": 16,
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
      "parentClass": "rounded-lg text-muted-foreground flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0"
    },
    {
      "index": 6,
      "tag": "a",
      "text": "",
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
        "paddingTop": 10,
        "paddingRight": 16,
        "paddingBottom": 10,
        "paddingLeft": 16,
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
      "parentClass": "rounded-lg text-muted-foreground flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0"
    },
    {
      "index": 7,
      "tag": "a",
      "text": "",
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
        "paddingTop": 10,
        "paddingRight": 16,
        "paddingBottom": 10,
        "paddingLeft": 16,
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
      "parentClass": "rounded-lg text-muted-foreground flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0"
    },
    {
      "index": 8,
      "tag": "a",
      "text": "",
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
        "paddingTop": 10,
        "paddingRight": 16,
        "paddingBottom": 10,
        "paddingLeft": 16,
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
      "parentClass": "rounded-lg text-muted-foreground flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0"
    },
    {
      "index": 9,
      "tag": "a",
      "text": "",
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
        "paddingTop": 10,
        "paddingRight": 16,
        "paddingBottom": 10,
        "paddingLeft": 16,
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
      "parentClass": "rounded-lg text-muted-foreground flex h-auto w-full flex-col items-stretch justify-start gap-1 bg-transparent p-0"
    }
  ],
  "buttonSummary": {
    "total": 26,
    "withOverflow": 0,
    "tooSmall": 16,
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
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 0,
        "clientWidth": 0,
        "scrollHeight": 0,
        "clientHeight": 0
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
        "x": 16,
        "y": 80,
        "width": 343,
        "height": 218,
        "top": 80,
        "right": 359,
        "bottom": 298,
        "left": 16
      },
      "computed": {
        "paddingTop": 0,
        "paddingRight": 0,
        "paddingBottom": 0,
        "paddingLeft": 0,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 341,
        "clientWidth": 341,
        "scrollHeight": 216,
        "clientHeight": 216
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
        "x": 41,
        "y": 195,
        "width": 293,
        "height": 78,
        "top": 195,
        "right": 334,
        "bottom": 273,
        "left": 41
      },
      "computed": {
        "paddingTop": 16,
        "paddingRight": 16,
        "paddingBottom": 16,
        "paddingLeft": 16,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 291,
        "clientWidth": 291,
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
        "x": 16,
        "y": 322,
        "width": 343,
        "height": 250,
        "top": 322,
        "right": 359,
        "bottom": 572,
        "left": 16
      },
      "computed": {
        "paddingTop": 0,
        "paddingRight": 0,
        "paddingBottom": 0,
        "paddingLeft": 0,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 341,
        "clientWidth": 341,
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
        "x": 41,
        "y": 395,
        "width": 293,
        "height": 70,
        "top": 395,
        "right": 334,
        "bottom": 465,
        "left": 41
      },
      "computed": {
        "paddingTop": 16,
        "paddingRight": 16,
        "paddingBottom": 16,
        "paddingLeft": 16,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 291,
        "clientWidth": 291,
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
        "x": 41,
        "y": 477,
        "width": 293,
        "height": 70,
        "top": 477,
        "right": 334,
        "bottom": 547,
        "left": 41
      },
      "computed": {
        "paddingTop": 16,
        "paddingRight": 16,
        "paddingBottom": 16,
        "paddingLeft": 16,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 291,
        "clientWidth": 291,
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
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 0,
        "clientWidth": 0,
        "scrollHeight": 0,
        "clientHeight": 0
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
        "paddingTop": 2,
        "paddingRight": 10,
        "paddingBottom": 2,
        "paddingLeft": 10,
        "fontSize": 0,
        "lineHeight": 0,
        "scrollWidth": 0,
        "clientWidth": 0,
        "scrollHeight": 0,
        "clientHeight": 0
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
        "x": 305.3125,
        "y": 356,
        "width": 28.6875,
        "height": 22,
        "top": 356,
        "right": 334,
        "bottom": 378,
        "left": 305.3125
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
        "x": 16,
        "y": 596,
        "width": 146.9375,
        "height": 44,
        "top": 596,
        "right": 162.9375,
        "bottom": 640,
        "left": 16
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
            "x": 16,
            "y": 16,
            "width": 44,
            "height": 44,
            "top": 16,
            "right": 60,
            "bottom": 60,
            "left": 16
          },
          "widthRatio": 0.2100238663484487,
          "heightRatio": 0.102803738317757,
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
          "index": 2,
          "tag": "main",
          "classNames": [
            "flex-1",
            "overflow-auto"
          ],
          "boundingBox": {
            "x": 0,
            "y": 0,
            "width": 375,
            "height": 812,
            "top": 0,
            "right": 375,
            "bottom": 812,
            "left": 0
          },
          "widthRatio": 1.7899761336515514,
          "heightRatio": 1.897196261682243,
          "isOutlier": true
        }
      ],
      "hasOutliers": true,
      "maxWidthDeviation": 1,
      "maxHeightDeviation": 1
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
            "lucide-menu"
          ],
          "boundingBox": {
            "x": 30,
            "y": 30,
            "width": 16,
            "height": 16,
            "top": 30,
            "right": 46,
            "bottom": 46,
            "left": 30
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
            "x": 0,
            "y": 0,
            "width": 0,
            "height": 0,
            "top": 0,
            "right": 0,
            "bottom": 0,
            "left": 0
          },
          "widthRatio": 1,
          "heightRatio": 1,
          "isOutlier": false
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
            "x": 0,
            "y": 0,
            "width": 0,
            "height": 0,
            "top": 0,
            "right": 0,
            "bottom": 0,
            "left": 0
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
            "x": 0,
            "y": 0,
            "width": 0,
            "height": 0,
            "top": 0,
            "right": 0,
            "bottom": 0,
            "left": 0
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
            "x": 0,
            "y": 0,
            "width": 0,
            "height": 0,
            "top": 0,
            "right": 0,
            "bottom": 0,
            "left": 0
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
            "x": 0,
            "y": 0,
            "width": 0,
            "height": 0,
            "top": 0,
            "right": 0,
            "bottom": 0,
            "left": 0
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
    "16 buttons smaller than 44×44px (touch target size)",
    "14 buttons with padding < 4px",
    "4 flex/grid containers with size outliers (>10% deviation)"
  ]
}
```