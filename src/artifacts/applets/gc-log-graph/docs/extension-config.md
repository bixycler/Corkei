# Extension: Config & Shared Helpers

## Overview

`extensions/config.js` is the central configuration module. It exports the `GCGraphConfig` object (also set as `window.GCGraphConfig`) and four shared helper functions used across the core app and all extensions.

## `GCGraphConfig` Structure

### `constants` — Core Visual Constants

| Key | Type | Purpose |
|---|---|---|
| `windowSize` | number | Rolling window size for GC rate calculation (events) |
| `colors` | object | Named colors for all GC types and heap lines |
| `radii` | object | Dot radii by GC type (fullGC: 5, concurrent: 3, etc.) |
| `priority` | object | Z-order priority (higher = drawn on top) |
| `thresholds` | object | `longPauseMs`: duration threshold for "long pause" classification |
| `popup` | object | Popup dialog styling (background, border, shadow, text/code colors) |

The `constants.graph` and `constants.rates` sub-objects are derived at runtime in `app.js` from `constants.colors` (adding opacity, stroke widths, dash arrays).

### `accessLog` — AccessLog Extension Config

| Key | Default | Purpose |
|---|---|---|
| `windowSize` | 30 | Rolling window for access log rate calculation |
| `showStatusBar` | false | Whether to render per-request status bars |
| `metrics` | `['rps', 'Bps']` | Which rate area plots to show |
| `visuals.rateHeightRatio` | 0.5 | Rate plot height as fraction of chart height |
| `visuals.bandHeight` | 30 | Height of status bar band |
| `visuals.dotRadius` | 2 | Base dot radius |
| `visuals.highlightDotRadius` | 4 | Radius for large-response dots |
| `visuals.highlightThreshold` | 0.3 | Fraction of max size above which dots are enlarged |
| `colors.rps` | `{fill, opacity}` | Rate area styling for RPS |
| `colors.Bps` | `{fill, opacity}` | Rate area styling for bytes/sec |
| `colors.status` | `{error, warning, success}` | Status bar colors by HTTP status range |
| `colors.rank` | `{0, 1, 2, default}` | Colors for top-3 ranked request types |

### `serviceLog` — ServiceLog Extension Config

| Key | Default | Purpose |
|---|---|---|
| `windowSize` | 30 | Rolling window for service log rate calculation |
| `metrics` | `['procRate', 'goodsRate']` | Rate area plots to show |
| `visuals.dotRadius` | 2 | Base dot radius |
| `visuals.rateHeightRatio` | 0.5 | Rate plot height ratio |
| `colors.dot` | `#9b59b6` | Default dot color (purple) |
| `colors.airListSch` | `#e74c3c` | Color for airListSchSv methods (red) |
| `colors.procRate` | `{fill, opacity}` | Rate area for processing time rate |
| `colors.goodsRate` | `{fill, opacity}` | Rate area for goods count rate |

### `serviceAccessLog` — Composite Extension Config

| Key | Default | Purpose |
|---|---|---|
| `yOffset` | `'auto'` | Vertical offset between AccessLog and ServiceLog layers |
| `accessLog.metrics` | `['Bps']` | Override: only Bps rate for access log |
| `accessLog.showStatusBar` | false | Override: no status bars |
| `serviceLog.metrics` | `['goodsRate']` | Override: only goods rate for service log |

## Shared Helper Functions

### `formatResponseSize(bytes)`
Formats byte counts for display: `1234567` → `"1.18 MB"`, `5432` → `"5.3 KB"`.

### `formatCountHuman(count)`
Abbreviates large counts: `1500` → `"1.5k"`, `2500000` → `"2.5M"`.

### `formatDurationHuman(value, unit)`
Smart duration formatting with unit auto-detection:
- `unit='auto'`: values ≥ 1000 treated as ms, otherwise as μs
- Shows parenthetical breakdown for long durations: `"45000 ms (0m 45s)"`
- Supports explicit `'ms'` or `'μs'` unit parameter

### `formatTimestampInTz(date, rawStr)`
Formats a Date in the user-selected timezone:
- `'local'` → browser's local time
- Otherwise → applies the offset (e.g., `+0900`) mathematically and formats via UTC formatter to avoid double conversion
