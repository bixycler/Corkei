# Extension: ServiceAccessLog

## Overview

`extensions/service_access_log.js` is a **composite extension** that renders both AccessLog and ServiceLog simultaneously on the same chart. It delegates all lifecycle hooks to isolated instances of the two component extensions.

## Design Pattern

### Instance Isolation

Each component extension gets its own isolated instance via `Object.create()`:

```js
this._accessLog = Object.create(AccessLogExtension);
this._accessLog._events = [];
// Call reset on the new instance
AccessLogExtension.reset.call(this._accessLog);
```

This creates a prototype chain where the instance inherits methods from the original extension but has its own `_events` array. All method calls use `.call(this._instance)` to bind the correct `this`.

> **Why not just use the global extensions?** Because all registered extensions' `parse()` hooks are called on every line. If ServiceAccessLog shared state with the standalone AccessLog and ServiceLog, events would be double-counted.

### Lifecycle Delegation

| Hook | Behavior |
|---|---|
| `reset()` | Creates fresh instances of both components |
| `parse(line)` | Delegates to both `AccessLogExtension.parse` and `ServiceLogExtension.parse` |
| `finish()` | Calls `finish()` on both components |
| `render()` | Renders AccessLog first, then ServiceLog with Y-offset |
| `onZoom()` | Delegates to both components' `onZoom()` |

## Rendering Layout

The two extensions are stacked vertically:

```
y=0  ┌──────────────────────────┐
     │  AccessLog dots & rates  │
     │                          │
y=N  ├──────────────────────────┤  ← yOffset
     │  ServiceLog dots & rates │
     │                          │
     └──────────────────────────┘
```

The Y-offset is calculated as:
- If `config.yOffset === 'auto'`: `highlightDotRadius * 2.5 + 2` (positioning ServiceLog just below the tallest AccessLog dot)
- Otherwise: explicit pixel value from config

ServiceLog is rendered into a separate `<g>` element with a `translate(0, yOffset)` transform.

## Config Overrides

During `render()`, the global `GCGraphConfig.accessLog` and `GCGraphConfig.serviceLog` are temporarily replaced with merged configs:

| Component | Override | Purpose |
|---|---|---|
| AccessLog | `metrics: ['Bps']` | Only show bytes/sec rate (skip RPS to reduce clutter) |
| AccessLog | `showStatusBar: false` | Hide individual request bars |
| ServiceLog | `metrics: ['goodsRate']` | Only show goods rate (skip procRate) |

Original configs are restored after rendering to avoid side effects.
