# Layout Analysis: settings-appearance
**Viewport:** mobile | **URL:** http://localhost:3000/settings/appearance
**Generated:** 2026-04-01T02:24:51.350Z

## Summary

### Warnings
- ⚠️ 19 buttons smaller than 44×44px (touch target size)
- ⚠️ 17 buttons with padding < 4px
- ⚠️ 7 flex/grid containers with size outliers (>10% deviation)

---

## Headings

| Level | Text | Size | Position |
|-------|------|------|----------|
| h1 | "Settings" | 343×32 @ (16, 24) | (16, 24) |

## Interactive Elements (Buttons/Links)

**Summary:** 29 total, 0 with overflow, 19 too small (<44px), 17 tiny padding (<4px)

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
| 13 | a | "Appearance" | 36×36 ❌ | 0/0/0/0 ⚠️ | None |
| 14 | a | "Notifications" | 36×36 ❌ | 0/0/0/0 ⚠️ | None |
| 15 | a | "Security" | 36×36 ❌ | 0/0/0/0 ⚠️ | None |
| 16 | a | "Advanced" | 36×36 ❌ | 0/0/0/0 ⚠️ | None |
| 17 | a | "MCP Servers" | 36×36 ❌ | 0/0/0/0 ⚠️ | None |
| 18 | a | "Maintenance" | 36×36 ❌ | 0/0/0/0 ⚠️ | None |
| 19 | a | "Webhooks" | 36×36 ❌ | 0/0/0/0 ⚠️ | None |
| ... | ... | (6 more) | ... | ... | ... |

## Card-like Containers

**Summary:** 7 detected, 7 without title, 0 with inconsistent padding

| Index | Tag | Classes | Size | Has Title | Padding |
|-------|-----|---------|------|-----------|----------|
| 0 | div | border bg-card text-card-foreground | 0×0 @ (0, 0) | ❌ None | 0/0/0/0 |
| 1 | div | rounded-xl border bg-card | 343×471 @ (16, 164) | ❌ None | 0/0/0/0 |
| 2 | div | rounded-lg text-muted-foreground flex | 0×0 @ (0, 0) | ❌ None | 0/0/0/0 |
| 3 | span | inline-flex items-center gap-1.5 | 0×0 @ (0, 0) | ❌ None | 2/10/2/10 |
| 4 | button | justify-center whitespace-nowrap rounded-md | 293×101 @ (41, 275) | ❌ None | 16/8/16/8 |
| 5 | button | justify-center whitespace-nowrap rounded-md | 293×101 @ (41, 392) | ❌ None | 16/8/16/8 |
| 6 | button | justify-center whitespace-nowrap rounded-md | 293×101 @ (41, 509) | ❌ None | 16/8/16/8 |

## Flex/Grid Containers

**7 containers with sibling size outliers (>10% deviation):**

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

### a.inline-flex.items-center.justify-center
- Display: flex
- Children: 2
- Max width deviation: 100.0%
- Max height deviation: 100.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 1 | span | 0×0 @ (0, 0) | W:-100% H:-100% |

### a.inline-flex.items-center.justify-center
- Display: flex
- Children: 2
- Max width deviation: 100.0%
- Max height deviation: 100.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 1 | span | 0×0 @ (0, 0) | W:-100% H:-100% |

### a.inline-flex.items-center.justify-center
- Display: flex
- Children: 2
- Max width deviation: 100.0%
- Max height deviation: 100.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 1 | span | 0×0 @ (0, 0) | W:-100% H:-100% |

### a.inline-flex.items-center.justify-center
- Display: flex
- Children: 2
- Max width deviation: 100.0%
- Max height deviation: 100.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 1 | span | 0×0 @ (0, 0) | W:-100% H:-100% |

### a.inline-flex.items-center.justify-center
- Display: flex
- Children: 2
- Max width deviation: 100.0%
- Max height deviation: 100.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 1 | span | 0×0 @ (0, 0) | W:-100% H:-100% |

### a.inline-flex.items-center.justify-center
- Display: flex
- Children: 2
- Max width deviation: 100.0%
- Max height deviation: 100.0%

| Index | Tag | Size | Deviation |
|-------|-----|------|-----------|
| 1 | span | 0×0 @ (0, 0) | W:-100% H:-100% |

## Invalid Nesting

*No invalid nesting detected*

## Text Collisions

*No text collisions detected*

---

## Raw Data (JSON)

```json
{
  "page": "settings-appearance",
  "viewport": "mobile",
  "timestamp": "2026-04-01T02:24:51.350Z",
  "url": "http://localhost:3000/settings/appearance",
  "title": "Pinchy - Agent Operations Console",
  "headings": [
    {
      "level": 1,
      "text": "Settings",
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
    "total": 29,
    "withOverflow": 0,
    "tooSmall": 19,
    "tinyPadding": 17
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
        "y": 164,
        "width": 343,
        "height": 471,
        "top": 164,
        "right": 359,
        "bottom": 635,
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
        "scrollHeight": 469,
        "clientHeight": 469
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
        "x": 41,
        "y": 275,
        "width": 293,
        "height": 101,
        "top": 275,
        "right": 334,
        "bottom": 376,
        "left": 41
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
        "x": 41,
        "y": 392,
        "width": 293,
        "height": 101,
        "top": 392,
        "right": 334,
        "bottom": 493,
        "left": 41
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
        "x": 41,
        "y": 509,
        "width": 293,
        "height": 101,
        "top": 509,
        "right": 334,
        "bottom": 610,
        "left": 41
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
    "19 buttons smaller than 44×44px (touch target size)",
    "17 buttons with padding < 4px",
    "7 flex/grid containers with size outliers (>10% deviation)"
  ]
}
```