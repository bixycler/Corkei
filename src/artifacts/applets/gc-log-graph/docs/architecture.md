# GC Log Graph — Architecture

## Overview

A D3.js-based single-page application that parses Java GC log files and renders interactive heap usage timelines. It supports both modern G1 (unified logging) and legacy CMS/ParNew log formats, with a plugin-based extension system for overlaying correlated log data (access logs, service logs).

## File Structure

```
gc-log-graph/
├── index.html              # Entry point: controls bar, chart container, tooltip
├── app.js                  # Core: parsing, rendering, zoom, legend
├── style.css               # Chart and layout styles
├── documentation.html      # Docs index page
├── extensions/
│   ├── config.js           # Shared config constants + helper functions
│   ├── access_log.js       # AccessLog extension (HTTP access log overlay)
│   ├── service_log.js      # ServiceLog extension (app service call overlay)
│   └── service_access_log.js  # Composite: AccessLog + ServiceLog together
├── assets/
│   ├── test.log            # Default sample G1 GC log
│   ├── test-cms.log        # Sample CMS/ParNew GC log
│   ├── detect-gc-cms-churn.sh     # Utility: detect high-churn ParNew GCs
│   └── grep-multi-city-searches.sh  # Utility: extract multi-city searches
└── docs/                   # This documentation
```

## Data Flow

```
File Upload / Default Fetch
         │
    processLog(name, text)
         │
    processGCLog(text)
         │
         ├── extensions.forEach(ext.reset())
         │
         ├── parseGCLog(lines, ...) ──── format detection ───┐
         │                                                    │
         │                              ┌─────────────────────┤
         │                              │                     │
         │                    parseG1GCLog()          parseLegacyGCLog()
         │                              │                     │
         │                              └─────────┬───────────┘
         │                                        │
         │                        (ext.parse(line) called per line)
         │
         ├── Post-processing: filter, sort, classify, assign colors
         ├── Rate calculations (alloc rate, GC rate)
         ├── extensions.forEach(ext.finish())
         │
    renderChart(data)
         │
         ├── D3 scales, axes, grid
         ├── Area/Line graph (heap total + used)
         ├── GC segments, failed event lines
         ├── Rate overlays (alloc/GC curves + means)
         ├── extensions.forEach(ext.render())
         ├── Interactive dots (tooltip, click popup)
         ├── Zoom behavior (ext.onZoom())
         └── Legend
```

## Format Auto-Detection

`parseGCLog()` inspects the first 20 lines from `startLine`:

| Pattern found | Format |
|---|---|
| `GC(\d+)` | **G1** unified logging (Java 9+) |
| `[GC`, `[CMS`, `[ParNew` | **Legacy** CMS/ParNew (Java 8) |

If neither matches, defaults to G1.

## GC Event Data Model

Each parser produces records with this common shape:

```js
{
  id,                  // G1: integer GC ID, Legacy: float uptime string
  rawLines: [],        // Original log lines for popup display
  parsed: boolean,
  timestamp: Date,
  timestampRaw: string, // Original timestamp string (preserves timezone)
  actions: [],         // e.g. ["Pause Young (Normal)"] or ["ParNew"]
  beforeBytes, afterBytes, totalBytes, // Heap memory figures
  totalDuration,       // Milliseconds (accumulated across phases)
  isConcurrent,        // true for concurrent GC phases
  isFailed             // true for broken/failed events (Legacy only)
}
```

Post-processing adds:
- `action` — joined string from `actions[]`
- `duration` — rounded `totalDuration`
- `color`, `priority`, `radius` — from classification
- `allocatedBytes`, `reclaimedBytes`, `instantAllocRate`, `instantGcRate` — from rate calculation

## Event Classification

Applied after parsing, in priority order:

| Condition | Type | Color |
|---|---|---|
| Action contains `"Pause Full"` | Full GC | Red |
| `isConcurrent === true` | Concurrent GC | Crimson |
| Duration > threshold AND action contains `"Mixed"` | Mixed Long Pause | Dark Orange |
| Duration > threshold | Long Pause | Orange |
| Action contains `"Mixed"` | Mixed GC | Blue |
| Otherwise | Normal GC | Light Blue |

Threshold is configurable via `GCGraphConfig.constants.thresholds.longPauseMs` (default: 100ms).

## Rate Calculation

A **count-based sliding window** of `CONST.windowSize` events (default: 10) computes per-event instant rates:

1. **Allocation rate** = bytes allocated since previous GC ÷ time span
2. **GC reclaim rate** = bytes reclaimed this GC ÷ time span
3. Both expressed in **GB/s** (conversion factor: `Bms2GBs = (1 << 30) / 1000`)

For events early in the dataset (index < windowSize), the full total time span is used instead to avoid artificial spikes.

Mean rates are computed as total bytes ÷ total time and drawn as dashed horizontal lines.

## Rendering Pipeline

Built with **D3.js v7** using an SVG-based chart:

1. **Scales**: `scaleTime` for X (timestamps), `scaleLinear` for Y (heap in GB), optional right Y-axis for rates
2. **Axes**: bottom (time in selected timezone), left (memory), right (rate if enabled)
3. **Graph modes**: Area (filled) or Line — toggled via dropdown
4. **GC segments**: vertical lines from `beforeBytes` to `afterBytes` (toggleable)
5. **Failed event lines**: vertical lines from top to dot position
6. **Rate curves**: `curveMonotoneX` interpolated lines for instant alloc/GC rates
7. **Extension rendering**: delegated to selected extension's `render()`
8. **Dots**: circles for each GC event, with tooltip on hover and popup on click
9. **Zoom**: D3 zoom with wheel and drag, max zoom = 1ms/pixel, persisted across re-renders
10. **Legend**: dynamic items based on visible features

## Extension System

Extensions are registered globally via `window.GCGraphExtensions[]` and participate in the full data lifecycle:

### Lifecycle Hooks

| Hook | When | Purpose |
|---|---|---|
| `reset()` | Before parsing starts | Clear internal state |
| `parse(line)` | Every log line during parsing | Extract extension-specific events |
| `finish()` | After all parsing complete | Post-process: sort, distribute, calculate rates |
| `render(chartGroup, scales, dims)` | During chart rendering | Draw extension visuals in the clipped SVG group |
| `onZoom(scales)` | On every zoom/pan event | Update extension elements' X positions |

### Extension Selection

A dropdown (`#extension-select`) controls which extension renders. Only the selected extension's `render()` and `onZoom()` are called. All extensions' `reset()`, `parse()`, and `finish()` always run so data is ready if the user switches.

### Registered Extensions

1. **AccessLog** — HTTP access log events (requests, status codes, response sizes)
2. **ServiceLog** — Application service call metrics (processing time, goods counts)
3. **ServiceAccessLog** — Composite: renders both AccessLog and ServiceLog together

See individual extension docs for details.

## Timezone Handling

- The log's timezone offset (e.g., `+0900`) is auto-detected from the first parsed timestamp
- Stored in `GCGraphConfig.detectedLogTimezone` for extensions to use
- A timezone selector offers "Local" (browser) or "Log (UTC+XXXX)"
- All timestamp formatting goes through `formatTimestampInTz()` which applies the selected offset
