# Layout Probe Summary Report
**Generated:** 2026-04-01T02:25:02.097Z
**Pages Analyzed:** 3 | **Viewports:** 2

## Overall Statistics

| Page | Viewport | Buttons | Issues | Warnings | Critical |
|------|----------|---------|--------|----------|----------|
| settings-appearance | desktop | 29 | 24 | 3 | 0 |
| settings-appearance | mobile | 29 | 36 | 3 | 0 |
| models | desktop | 26 | 25 | 3 | 0 |
| models | mobile | 26 | 30 | 3 | 0 |
| dashboard | desktop | 23 | 25 | 3 | 0 |
| dashboard | mobile | 23 | 30 | 3 | 0 |

## Critical Issues by Page

*No critical issues detected*

## Warnings by Page

### settings-appearance (desktop)
- ⚠️ 14 buttons smaller than 44×44px (touch target size)
- ⚠️ 10 buttons with padding < 4px
- ⚠️ 13 flex/grid containers with size outliers (>10% deviation)

### settings-appearance (mobile)
- ⚠️ 19 buttons smaller than 44×44px (touch target size)
- ⚠️ 17 buttons with padding < 4px
- ⚠️ 7 flex/grid containers with size outliers (>10% deviation)

### models (desktop)
- ⚠️ 11 buttons smaller than 44×44px (touch target size)
- ⚠️ 14 buttons with padding < 4px
- ⚠️ 8 flex/grid containers with size outliers (>10% deviation)

### models (mobile)
- ⚠️ 16 buttons smaller than 44×44px (touch target size)
- ⚠️ 14 buttons with padding < 4px
- ⚠️ 4 flex/grid containers with size outliers (>10% deviation)

### dashboard (desktop)
- ⚠️ 11 buttons smaller than 44×44px (touch target size)
- ⚠️ 14 buttons with padding < 4px
- ⚠️ 10 flex/grid containers with size outliers (>10% deviation)

### dashboard (mobile)
- ⚠️ 16 buttons smaller than 44×44px (touch target size)
- ⚠️ 14 buttons with padding < 4px
- ⚠️ 5 flex/grid containers with size outliers (>10% deviation)

## Detailed Findings

### settings-appearance

**Cross-Viewport Comparison:**
- Desktop buttons: 29 vs Mobile: 29
- Desktop cards: 7 vs Mobile: 7
- Desktop critical: 0 vs Mobile: 0

#### desktop

**Undersized Buttons (<44px or tiny padding):**
- [0] `button`: "Open navigation menu" (0×0px, pad:0/0)
- [1] `button`: "Notifications" (44×44px, pad:0/0)
- [2] `button`: "" (44×44px, pad:0/0)
- [12] `button`: "Toggle theme" (44×44px, pad:0/0)
- [13] `a`: "Appearance" (113×32px, pad:8/12)

#### mobile

**Undersized Buttons (<44px or tiny padding):**
- [0] `button`: "Open navigation menu" (44×44px, pad:0/0)
- [1] `button`: "Notifications" (0×0px, pad:0/0)
- [2] `button`: "" (0×0px, pad:0/0)
- [3] `a`: "" (0×0px, pad:10/16)
- [4] `a`: "" (0×0px, pad:10/16)

---

### models

**Cross-Viewport Comparison:**
- Desktop buttons: 26 vs Mobile: 26
- Desktop cards: 11 vs Mobile: 11
- Desktop critical: 0 vs Mobile: 0

#### desktop

**Undersized Buttons (<44px or tiny padding):**
- [0] `button`: "Open navigation menu" (0×0px, pad:0/0)
- [1] `button`: "Notifications" (44×44px, pad:0/0)
- [2] `button`: "" (44×44px, pad:0/0)
- [12] `button`: "Toggle theme" (44×44px, pad:0/0)
- [14] `button`: "copilotNo models loaded" (804×36px, pad:0/0)

#### mobile

**Undersized Buttons (<44px or tiny padding):**
- [0] `button`: "Open navigation menu" (44×44px, pad:0/0)
- [1] `button`: "Notifications" (0×0px, pad:0/0)
- [2] `button`: "" (0×0px, pad:0/0)
- [3] `a`: "" (0×0px, pad:10/16)
- [4] `a`: "" (0×0px, pad:10/16)

---

### dashboard

**Cross-Viewport Comparison:**
- Desktop buttons: 23 vs Mobile: 23
- Desktop cards: 19 vs Mobile: 19
- Desktop critical: 0 vs Mobile: 0

#### desktop

**Undersized Buttons (<44px or tiny padding):**
- [0] `button`: "Open navigation menu" (0×0px, pad:0/0)
- [1] `button`: "Notifications" (44×44px, pad:0/0)
- [2] `button`: "" (44×44px, pad:0/0)
- [12] `button`: "Toggle theme" (44×44px, pad:0/0)
- [13] `a`: "default" (42×16px, pad:0/0)

#### mobile

**Undersized Buttons (<44px or tiny padding):**
- [0] `button`: "Open navigation menu" (44×44px, pad:0/0)
- [1] `button`: "Notifications" (0×0px, pad:0/0)
- [2] `button`: "" (0×0px, pad:0/0)
- [3] `a`: "" (0×0px, pad:10/16)
- [4] `a`: "" (0×0px, pad:10/16)

---

## Recommendations

3. **Increase Touch Targets**: Ensure buttons are at least 44×44px for accessibility
4. **Add Card Titles**: Cards should have clear headings for structure