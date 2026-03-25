# G1 GC Log Processing

## Overview

The `parseG1GCLog()` function handles modern Java unified GC logging (Java 9+), where each GC event is tagged with `GC(ID)`. Unlike legacy CMS logs, G1 events can span multiple lines — all sharing the same `GC(ID)` — so the parser accumulates data across lines into a `gcMap` keyed by ID.

## Format Recognition

Auto-detection in `parseGCLog()` scans the first 20 lines from `startLine`:
- If any line matches `GC(\d+)` → **G1 format** (this parser)
- If any line contains `[GC`, `[CMS`, or `[ParNew` → legacy format (see [CMS doc](./CMS-GC-log-parsing-algorithm.md))

## Regex Patterns

### Timestamp
```
/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+\+\d{4})\]/
```
Matches ISO-8601 timestamps like `[2025-12-13T13:18:36.630+0900]`. No `^` anchor — the timestamp can appear anywhere in the line (e.g., after a prefix).

### GC ID
```
/GC\((\d+)\)/
```
Extracts the numeric ID from `GC(42)`. Used to associate lines with the same event.

### Memory
```
/(\d+(?:\.\d+)?)([KMG]B?)->(\d+(?:\.\d+)?)([KMG]B?)\((\d+(?:\.\d+)?)([KMG]B?)\)/
```
Matches patterns like `100M->50M(512M)` or `9.304GB->5.201GB(12.480GB)`.

Groups: `beforeVal`, `beforeUnit`, `afterVal`, `afterUnit`, `totalVal`, `totalUnit`.

Unit normalization: `GB` → `G`, `MB` → `M`, `KB` → `K` (the `B` suffix is stripped by `parseSize()`).

### Duration
```
/(\d+(?:\.\d+)?)ms/
```
Extracts millisecond values like `23.456ms`.

## Parsing Algorithm

```
for each line:
    1. Call ext.parse(line) on all extensions
    2. Match GC ID → skip if no match
    3. Get or create record in gcMap[id]
    4. Store rawLine for popup display
    5. If not yet parsed:
       a. Extract timestamp (first occurrence wins)
       b. Match memory pattern:
          - Store before/after/total bytes
          - Extract action text (between GC(ID) and memory match)
          - Detect concurrent phase (action contains 'concurrent', 'remark', 'cleanup')
          - Accumulate duration
          - Mark record as parsed, increment event count
```

### Action Extraction

The action title is the text between `GC(ID)` closing paren and the memory pattern's start position:

```
line: "[2025-...] GC(42) Pause Young (Normal) 100M->50M(512M) 23.456ms"
                         ^--- actionPart ---^
```

Extracted by: `line.substring(line.indexOf('GC(') + 3 + id.toString().length + 1, memMatch.index).trim()`

### Concurrent Phase Detection

If the `actionPart` (lowercased) contains `concurrent`, `remark`, or `cleanup`, the record is flagged `isConcurrent = true`. These events are rendered differently:
- Dots are shifted up by their radius (floating above the heap line)
- Excluded from area/line graph data

## Batch Processing

To keep the UI responsive on large logs, parsing is done in batches:

| Parameter | Value | Purpose |
|---|---|---|
| `GLOBAL_LIMIT` | 10,000 | Maximum total events |
| `BATCH_SIZE` | 1,000 | Events per batch before yielding |

After each batch, `processGCLog()` yields to the event loop (`await new Promise(r => setTimeout(r, 0))`) and updates the status text.

## Record Lifecycle

```
1. parseG1GCLog() → populates gcMap with raw records
2. processGCLog() post-processing:
   a. Filter: keep only records with parsed=true AND timestamp
   b. Join actions[] into action string
   c. Round totalDuration to 2 decimals
   d. Sort by timestamp
   e. Detect timezone from first record
   f. Classify events (color, priority, radius)
   g. Calculate rates
```

## Multi-Phase GC Events

Some G1 events (e.g., concurrent cycles) produce multiple lines with the same `GC(ID)`, each with its own memory pattern and duration. However, only the **first** memory pattern is captured (because `record.parsed` is set to `true` on the first match). Actions are accumulated in the `actions[]` array, and durations are summed into `totalDuration`.

The final display action merges all phases: e.g., `"Concurrent Mark + Concurrent Sweep"`.
