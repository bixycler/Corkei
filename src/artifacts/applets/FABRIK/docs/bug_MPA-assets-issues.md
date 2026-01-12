# Bug Report: Vite MPA Asset Duplication and Path Resolution Issues

**Date**: 2026-01-14  
**Vite Version**: 7.3.1  
**Project Type**: Multi-Page Application (MPA) with SolidJS  
**Severity**: High (broken production builds)

## Background: From Static Asset to Entry Point
<details>
<summary>When FabrikExplanation.html was not included in rollupOptions.input, it was treated as a static asset, making its assets (images, videos, etc.) not included in Vite build output. Then it has been input as a sub-page entry point for its assets to be built.</summary>

### Initial State: FabrikExplanation.html as a Pure Static Asset

Initially, `FabrikExplanation.html` was a simple documentation page referenced by iframes in other applets. It contained only static content (text, images, videos) with **no JavaScript**.

**Original FabrikExplanation.html** (simplified):
```html
<!DOCTYPE html>
<html>
<head>
  <title>FABRIK Explanation</title>
  <style>
    body { max-width: 800px; margin: 0 auto; }
  </style>
</head>
<body>
  <h3>Basic Case: a Free Rod</h3>
  <img src="assets/one-segment-free-base-shadow.svg">
  <p>When a single-segment chain is pulled...</p>
  
  <video src="assets/three-segments-iterative.webm" controls></video>
  <!-- No JavaScript at all -->
</body>
</html>
```

**How it was referenced**:
```html
<!-- In FabrickDemo-TwoJS/index.html -->
<iframe src="../FabrikExplanation.html"></iframe>
```

**Build behavior**: Vite **ignored** this HTML file completely because:
1. It wasn't listed in `rollupOptions.input`
2. It wasn't imported via JS/TS
3. The `<iframe src>` attribute uses a plain string, not a processed import

**Problem**: The referenced assets (SVG, WebM) inside `FabrikExplanation.html` were **not discovered** by Vite during the build. They wouldn't be copied to `dist/`, causing broken images/videos in production.

### Evolution: Adding JavaScript Requires Entry Point Status

When we added an inline script to enable iframe height synchronization:

```html
<body>
  <!-- ... content ... -->
  
  <script type="module">
    import { responseHeight } from './window-message-channel.js'
    responseHeight('FabrikExplanation.html')
  </script>
</body>
```

**New requirements**:
1. **Asset Discovery**: Vite needs to find and bundle `window-message-channel.js`
2. **Import Translation**: The `import` statement must be transformed to point to the bundled, hashed JS file
3. **Dependency Crawling**: Vite must process all assets referenced within the HTML (images, videos)

**The only way** to achieve this in Vite is to make `FabrikExplanation.html` an **entry point** by adding it to `rollupOptions.input`.

### Why Entry Point Status Is Necessary

Vite's HTML processing has two modes:

| Aspect | Static Asset | Entry Point |
|--------|-------------|-------------|
| **Discovery** | Only if imported via JS | Always processed |
| **Asset Crawling** | None | Scans `<img>`, `<video>`, `<script>`, etc. |
| **Script Processing** | Raw copy | Transforms `<script type="module">` |
| **Output Location** | `dist/assets/` (if imported) | `dist/` (preserves structure) |

**Without entry point status**, the inline `<script type="module">` would remain untranslated in the production build, causing "module not found" errors.

</details>

## Problem Summary

Once `FabrikExplanation.html` became an entry point (to enable script transformation and asset discovery), a **new problem** emerged: when the shared component referenced it using `new URL()` or `import ... from "...?url"`, Vite created **untranslated duplicate HTML files** in the `assets/` directory. These duplicates contain raw, unbundled script imports that fail in production with "script not found" errors.

## Reproduction Steps

### Project Structure
```
src/
├── index.tsx                          # Root entry (renders component)
├── artifacts/applets/FABRIK/
│   ├── FabrikExplanation.html         # Sub-page with inline script
│   ├── window-message-channel.js      # Module imported by FabrikExplanation
│   └── FabrikDemo-SolidSvg/
│       ├── index.html                 # Applet entry (uses custom element)
│       └── FabrikDemo-SolidSvg.tsx    # Shared component with iframe
```

### Initial Code (Broken)

**FabrikDemo-SolidSvg.tsx**:
```tsx
// Attempt 1: Using new URL()
<iframe src={new URL("../FabrikExplanation.html", import.meta.url).href} />

// Attempt 2: Using ?url import
import explanationUrl from "../FabrikExplanation.html?url";
<iframe src={explanationUrl} />
```

**FabrikExplanation.html**:
```html
<script type="module">
  import { responseHeight } from './window-message-channel.js'
  responseHeight('FabrikExplanation.html')
</script>
```

**vite.config.ts**:
```ts
export default defineConfig({
  // Initially missing appType: 'mpa'
  build: {
    rollupOptions: {
      input: {
        corkeiCore: resolve(__dirname, 'index.html'),
        'artifacts/applets/FABRIK/FabrikExplanation.html': resolve(__dirname, 'src/artifacts/applets/FABRIK/FabrikExplanation.html'),
        // ... other entries
      }
    }
  }
})
```

### Build Output (Broken)
```
dist/
├── src/artifacts/applets/FABRIK/
│   └── FabrikExplanation.html          # ✅ Correctly transformed (script bundled)
└── assets/artifacts/applets/FABRIK/
    └── FabrikExplanation.html          # ❌ Untranslated duplicate (raw import)
```

**The Problem**: The component's `new URL()` or `?url` import resolves to the **untranslated** version in `assets/`, causing runtime errors.

## Root Cause Analysis

### Why Duplication Occurs

1. **Entry Point Processing**: When `FabrikExplanation.html` is listed in `rollupOptions.input`, Vite processes it as an entry point:
   - Transforms inline `<script type="module">` imports
   - Bundles the imported JS into hashed files
   - Outputs to `dist/src/...` (preserving source structure)

2. **Asset Import Behavior**: When using `new URL("../FabrikExplanation.html", import.meta.url)` or `import ... from "...?url"`:
   - Vite treats the HTML file as a **static asset**, not an entry point reference
   - Copies the **raw source file** to `dist/assets/...` without transformation
   - The inline script's `import` statement remains untranslated

3. **Path Resolution**: The `?url` import or `new URL()` resolves to the asset copy, not the entry point version.

### Why It's Tricky

- **Dual Nature**: The HTML file is both an entry point (should be transformed) and an asset (referenced by JS)
- **Depth Variation**: The shared component is used at different directory depths (root vs. applet sub-page)
- **No Built-in Solution**: Vite doesn't provide a standard way to "import the URL of an entry point"

## Attempted Solutions

### ❌ Attempt 1: `BASE_URL` Absolute Paths
```tsx
<iframe src={`${import.meta.env.BASE_URL}src/artifacts/applets/FABRIK/FabrikExplanation.html`} />
```
**Result**: Works at root, fails in applet sub-pages (wrong relative depth).

### ❌ Attempt 2: `?url` Import
```tsx
import explanationUrl from "../FabrikExplanation.html?url";
<iframe src={explanationUrl} />
```
**Result**: Creates the untranslated duplicate in `assets/`. Same duplication issue as `new URL()`.

### ❌ Attempt 3: "Root Path Marker" Plugin (Overkill)
**Idea**: Inject a `data-root` attribute into every HTML file indicating its depth, then use a runtime helper to resolve paths.

```ts
// Proposed plugin (never implemented)
{
  name: 'root-path-marker',
  transformIndexHtml(html, ctx) {
    const depth = ctx.filename.split('/').length - projectRoot.split('/').length;
    const rootPath = '../'.repeat(depth);
    return html.replace('<body>', `<body data-root="${rootPath}">`);
  }
}
```

**Why Rejected**: 
- Overly complex "hack"
- Requires runtime JS to read `data-root` and construct paths
- Not a standard Vite pattern

### ✅ Solution: Prop-Based Path Resolution

**Key Insight**: The parent entry points (root `index.tsx` and applet `index.html`) **already know** the correct relative path to the explanation page. Pass it as a prop/attribute!

#### Implementation

**FabrikDemo-SolidSvg.tsx**:
```tsx
export default function FabrikDemoSolidSvg(props: { explanationUrl?: string }) {
  return (
    <iframe src={props.explanationUrl || "../FabrikExplanation.html"} />
  );
}

// Web Component support
class FabrikDemoSolidSvgElement extends HTMLElement {
  connectedCallback() {
    const shadowRoot = this.attachShadow({ mode: "open" });
    const explanationUrl = this.getAttribute("explanation-url") || undefined;
    render(() => <FabrikDemoSolidSvg explanationUrl={explanationUrl} />, shadowRoot);
  }
}
```

**Root index.tsx**:
```tsx
render(() => <FabrikDemoSolidSvg explanationUrl="./src/artifacts/applets/FABRIK/FabrikExplanation.html" />, root!)
```

**Applet index.html**:
```html
<fabrik-demo-solid-svg explanation-url="../FabrikExplanation.html"></fabrik-demo-solid-svg>
```

**vite.config.ts**:
```ts
export default defineConfig({
  appType: 'mpa',  // Important!
  // ... rest of config
})
```

#### Results
```
dist/
└── src/artifacts/applets/FABRIK/
    └── FabrikExplanation.html          # ✅ Only one copy, correctly transformed
```

**No duplication**, correct path resolution at all depths.

## Key Learnings

### Do's
✅ **Set `appType: 'mpa'`** for multi-page applications  
✅ **Use props/attributes** to pass resource paths to shared components  
✅ **List all HTML files** in `rollupOptions.input` to ensure asset discovery  
✅ **Let parents handle depth** - they know their own directory structure  

### Don'ts
❌ **Don't use `new URL(..., import.meta.url)`** for HTML entry points  
❌ **Don't use `import ... from "...?url"`** for HTML entry points  
❌ **Don't rely on `BASE_URL`** alone in portable builds with varying depths  
❌ **Don't create "global path resolution" hacks** when component props suffice  

## Workaround for Other Projects

If you encounter similar issues:

1. **Identify the shared component** that references the HTML entry point
2. **Add a prop/attribute** for the resource URL
3. **Update parent entry points** to pass the correct relative path
4. **Remove any `new URL()` or `?url` imports** of HTML files
5. **Verify** that `appType: 'mpa'` is set in `vite.config.ts`

## Related Issues

- Vite doesn't distinguish between "entry point references" and "static asset imports"
- `?url` suffix always treats files as static assets, even if they're also entry points
- No built-in way to "get the output path of an entry point" from within JS

## Conclusion

This bug highlights a gap in Vite's MPA support: there's no standard way to reference one entry point from another in a depth-agnostic manner. The prop-based solution is clean and follows standard component patterns, but it requires manual path management by parent entry points.

**Recommendation**: Vite could benefit from a special import suffix (e.g., `?entry-url`) that resolves to the **output path** of an entry point rather than creating a static asset copy.
