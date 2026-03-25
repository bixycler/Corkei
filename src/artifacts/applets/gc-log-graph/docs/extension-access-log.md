# Extension: AccessLog

## Overview

`extensions/access_log.js` overlays HTTP access log data on the GC timeline chart. It parses access log lines that may be interleaved in the same file as GC events, and renders them as colored dots with rate area plots.

## Log Format

Parses lines matching:
```
... [09/Nov/2025:22:39:21 +0900] "POST /services/airSearch HTTP/1.1" 200 138179 698743
```

Regex: `/\[(\d{2}\/[A-Za-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2}\s[+-]\d{4})\]\s+"([A-Z]+)\s+([^"]+)\s+HTTP[^"]*"(?:\s+(\d+))?(?:\s+(\d+))?(?:\s+(\d+))?/`

### Extracted Fields

| Group | Field | Description |
|---|---|---|
| 1 | `timestamp` | Parsed from `DD/Mon/YYYY:HH:mm:ss ±ZZZZ` format |
| 2 | `method` | HTTP method (GET, POST, etc.) |
| 3 | `url` | Request path |
| 4 | `status` | HTTP status code (optional) |
| 5 | `size` | Response size in bytes (optional) |
| 6 | `latency` | Request latency in microseconds (optional) |

Timestamp parsing: the raw format `09/Nov/2025:22:39:21 +0900` is normalized to `09 Nov 2025 22:39:21 +0900` by replacing the first `:` and all `/` with spaces.

## Lifecycle

### `reset()`
Clears `_events[]`.

### `parse(line)`
Attempts to match the access log regex. On success, creates an event object and pushes to `_events[]`. Returns `true`/`false`.

### `finish()`
Three post-processing steps:

**1. Top-3 Request Coloring**
- Counts occurrences of each `method + url` combination
- Top 3 get dedicated colors (red, dark yellow, dark green)
- All others get grey
- Stores `_top3Legend` for potential legend display

**2. Sub-Second Distribution**
- Groups events sharing the same `timestamp.getTime()` (same second)
- Spreads them evenly within that second: `event[i].timestamp = sec + (i+1) * (1000 / (count+1))`
- This prevents dots from stacking on top of each other

**3. Rolling Window Rate Calculation**
- Window size from `GCGraphConfig.accessLog.windowSize` (default: 30)
- For each event at index `i`:
  - Look back `WINDOW_SIZE` events
  - Time span = max(actual time difference, current event's latency in seconds)
  - **RPS** = event count in window ÷ time span
  - **Bps** = sum of response sizes in window ÷ time span

## Rendering

### Rate Area Plots
- One D3 area per enabled metric (`rps`, `Bps`)
- Plots grow **downward** from the top of the chart (y=0 is the origin, values increase downward)
- Height limited to `rateHeightRatio` × chart height
- Semi-transparent fill, no stroke

### Status Bars (optional)
- Vertical lines per event, colored by HTTP status:
  - 500+ → red
  - 400+ → yellow
  - 200-300 → green
- Disabled by default (`showStatusBar: false`)

### Dots
- Colored by top-3 ranking (dedicated colors) or grey
- Non-top-3 dots rendered at 10% opacity
- Dots whose response size exceeds `highlightThreshold × maxSize` get enlarged radius
- Hover: radius increases, tooltip shows method, URL, time, status, size, latency, rates
- Click: modal popup with full original log line

### Zoom
`onZoom()` updates cached D3 selections:
- Re-positions bars and dots on the X axis
- Re-generates rate area paths with new X scale
- Uses `_cachedBars`, `_cachedDots`, `_cachedRatePaths` to avoid expensive DOM queries
