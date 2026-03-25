# Extension: ServiceLog

## Overview

`extensions/service_log.js` overlays application service call metrics on the GC timeline. It tracks START/END pairs on per-thread basis to build complete service call events with processing time, goods counts, and per-GDS breakdown metrics.

## Log Format

Parses application log lines with this header format:
```
2025-11-09 22:39:22 [http-nio-8080-exec-258] ...content...
```

### Regex Patterns

| Pattern | Purpose |
|---|---|
| `headerRegex` | Extracts date, time, thread ID from log line header |
| `logLineRegex` | Full line: header + remaining content |
| `startRegex` | Matches `[ClassName#methodSv()] : START` |
| `endRegex` | Matches `[ClassName#methodSv()] : END...Processing time [T] ms` with optional `lastGoodsCount` |
| `hknRegex` | Matches `Total time for getHknAgtInfo: (ms) N` |

Only methods containing `Sv` in the name are tracked as service calls.

## State Machine

The parser maintains `_activeCalls: Map<threadId, callInfo>` to track in-progress calls:

```
                ┌──── any log line ────┐
                │  (collect in logs[]) │
                ▼                      │
  [no entry] ──START──▶ [tracking] ────┤
                            │          │
                         hknAgt ──▶ [hknAgtTimes[]]
                            │
                           END ──▶ [emit event, delete from map]
```

### Call Info Object
```js
{
  className, methodName,
  startTime, startTimeRaw,
  threadId,
  logs: [],           // Accumulated log lines for this thread
  hknAgtTimes: []     // HknAgtInfo execution times
}
```

### Edge Cases
- **END without START**: A call entry is created on-the-fly; `startTime` is null, `endTime` is used as `timestamp`
- **Log lines before START**: Collected in `_activeCalls` so they appear in the popup
- **Multiple calls on same thread**: Each END clears the entry; next START begins fresh

## Event Object

```js
{
  timestamp,           // START time (or END time if no START)
  timestampRaw,
  endTime, endTimeRaw,
  className, methodName, threadId,
  processingTime,      // Milliseconds from END log
  lastGoodsCount,      // Number of goods returned (nullable)
  hknAgtTimes: [],     // Array of HknAgtInfo times
  metrics: {           // Only for airListSchSv methods
    gds,               // GDS name (Infini, Galileo, Amadeus)
    carrierConnectExecuteTime,
    hknAgtTime
  },
  logs: []             // All collected log lines for popup
}
```

### airListSchSv Metrics

When `methodName` includes `airListSchSv`, the processing time field is CSV-encoded:
```
Processing time [IN,null,120,null,45,30] ms
```
Fields: `[GDS, ?, carrierConnectTime1, ?, carrierConnectTime2, hknAgtTime]`

GDS codes are mapped: `IN` → Infini, `AP` → Galileo (Apollo), `AM` → Amadeus.

## Post-Processing (`finish()`)

### 1. Timezone Re-Alignment
Service logs use `YYYY-MM-DD HH:mm:ss` (no timezone). After GC log parsing detects the timezone (`GCGraphConfig.detectedLogTimezone`), all service log timestamps are re-parsed with the correct offset.

### 2. Sub-Second Distribution
Same algorithm as AccessLog: events within the same second are spread evenly.

### 3. Rate Calculation
Rolling window of `serviceLog.windowSize` (default: 30):
- **procRate** (ms/s) = sum of processing times in window ÷ time span
- **goodsRate** (goods/s) = sum of goods counts in window ÷ time span

## Rendering

### Rate Area Plots
Same pattern as AccessLog — downward-growing area plots for each enabled metric.

### Dots
- Radius scales by severity:
  - `≥30s` processing OR `≥1000` goods → radius 5
  - `≥10s` → radius 4
  - `≥1s` → radius 3
  - Otherwise → radius 2
- Color: red for `airListSchSv` methods, purple for all others
- Y position: `radius * 2.5` (top-aligned)

### Tooltip
Pre-calculated HTML stored in `_tooltipHtml` for performance. Shows method name, time, processing time, goods count, rates.

### Click Popup
Full detail view with:
- Class, thread, timestamps
- Processing time, goods count, rates
- GDS-specific metrics (if airListSchSv)
- Collapsible HknAgtTimes list (collapsed when > 100 items)
- Log lines with headers replaced by shortened `(HH:mm:ss)` prefix

### Zoom
Uses same cached selection pattern as AccessLog.
