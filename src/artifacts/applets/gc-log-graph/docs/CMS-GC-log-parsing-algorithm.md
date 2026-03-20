# CMS GC Log Parsing Algorithm

## Overview

The `parseLegacyGCLog` function parses older JVM GC log formats (CMS, ParNew) where events use nested bracket structures instead of modern `GC(ID)` tags. The core challenge is extracting accurate event metadata from deeply nested, sometimes broken bracket structures (see [samples](./CMS-GC-log-samples-format.txt)).

## Bracket Matching

A 3-level balanced bracket regex extracts the first complete event scope from each log line:

```
balancedBracketRegex = /\[(?:[^\[\]]|\[(?:[^\[\]]|\[[^\[\]]*\])*\])*\]/
```

### Decision Tree

- `line.match(balancedBracketRegex)` **matches**
  - `eventStr` = matched string, `bracketFailed` = false
  - *(well-formed event, e.g. `[GC [ParNew: 553K->69K(707K), 0.01 secs] ...]`)*
- `line.match(balancedBracketRegex)` **fails** → try fallback `line.match(/\[[^\[\]]*\]/)`
  - Fallback **matches**
    - `eventStr` = leaf bracket, `bracketFailed` = true
    - *(ill-formed: brackets deeper than 3 levels or truly broken)*
    - → `isFailed` = true (`bracketFailed` propagates)
  - Fallback **fails**
    - `eventStr` = `""` → **skip line** (`continue`)
    - *(no brackets at all, line is not a GC event)*

> **Key insight**: `bracketFailed = true` does NOT mean `eventStr` is empty.
> The fallback regex can still find a simple `[leaf]` bracket even when
> the full balanced regex fails. This is how broken events like
> `[ParNew (promotion failed)...` get captured with `isFailed = true`.

## Event Classification

After extracting `eventStr`, two flags are computed **before** action extraction:

```
isFailed    = bracketFailed || text contains "failed" or "failure"
isConcurrent = eventStr does NOT start with [GC or [Full GC
```

## Action Title Extraction

The action title depends on the event type:

- `eventStr` contains `"promotion failed"` → `"ParNew (promotion failed)"`
- `eventStr` contains `"concurrent mode failure"` → `"CMS (concurrent mode failure)"`
- `isConcurrent` is true → bracket name IS the action
  - e.g. `[CMS-concurrent-mark: ...]` → `"CMS-concurrent-mark"`
- `isConcurrent` is false (STW) → find **last child bracket** containing memory info
  - `innerContent` = `eventStr` without outer `[]`
  - iterate child brackets via `balancedBracketRegex`
  - pick last one matching `/\d+[KMG]B?[->(]/`
  - extract name from it
  - e.g. `[1 CMS-remark: 2647K(10395K)]` → `"CMS-remark"`
  - e.g. `[ParNew: 553K->69K(707K), ...]` → `"ParNew"`
- No match at all → fallback to `"Full GC"` or `"GC"`

**Why "last child with memory"?** Sub-tasks (Rescan, scrub, weak refs) report only duration, no memory. Main GC phases (ParNew, CMS-remark) report memory stats. This structural distinction avoids a brittle name blacklist of the sub-tasks.

## Top-Level Heap Extraction

To get the **total heap** numbers (not sub-phase stats like CMS Perm), inner brackets are stripped:

```
innerContent = eventStr without outer []
topLevelStr  = innerContent with all child brackets removed
             → leaves only top-level text: "GC 6990K->1234K(10951K), 0.88 secs"
```

> **Shared computation**: Both action detection and top-level extraction start
> by stripping the outer `[]` from `eventStr`. This is computed once as
> `innerContent` and reused for both purposes.

## Visualization

| Event Type | Graph Rendering |
|------------|----------------|
| STW (normal) | Dot at heap position, included in line/area graphs |
| STW (failed) | Dot at heap position + vertical failure line, included in graphs |
| Concurrent | Dot shifted up by radius from natural y, excluded from line/area graphs |
