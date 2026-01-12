import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { resolve } from 'path';
import { sync } from 'glob';
import type { PreRenderedChunk } from 'rollup';

export default defineConfig(({ mode: _mode }) => {
  const HMR = (process.env.VITE_HMR === 'true')
  const DEBUG = process.argv.includes('--debug') || process.argv.includes('-d') || process.env.DEBUG?.includes('vite');

  function getCommonBase(paths: string[]) {
    if (paths.length === 0) return '';
    const parts = paths.map(p => p.replace(/^src\//, '').split('/'));
    let common = parts[0].slice(0, -1);
    for (let i = 1; i < parts.length; i++) {
      let j = 0;
      while (j < common.length && j < parts[i].length - 1 && common[j] === parts[i][j]) j++;
      common = common.slice(0, j);
    }
    return common.join('/');
  }

  function getSharedPath(name: string, moduleIds: string[]) {
    const relativeModules = moduleIds
      .map(id => id.replace(resolve(__dirname, 'src') + '/', ''))
      .filter(id => !id.startsWith('\0') && !id.includes('node_modules'));

    // Check if name matches any module pinpointed
    const match = relativeModules.find(m => m.split('/').pop()?.replace(/\.[^/.]+$/, "") === name);
    if (match) return match.split('/').slice(0, -1).join('/');

    return getCommonBase(relativeModules);
  }

  function chunkFileNames(pattern: string) {
    return (chunkInfo: PreRenderedChunk) => {
      const outputKey = chunkInfo.isEntry ? 'entryFileNames' : 'chunkFileNames';
      const chunk = { ...chunkInfo };
      chunk.moduleIds = chunk.moduleIds.filter(id => !id.includes('node_modules'));

      let resultPath = pattern;
      if (chunkInfo.isEntry) {
        // If entry is src/artifacts/applets/A/index.html -> key is artifacts/applets/A
        // If entry is src/artifacts/applets/A/sub.html -> key is artifacts/applets/A/sub.html
        // But we now keep src/ in the keys to fix Vite level calculation
        let entryName = chunkInfo.name;
        if (entryName.startsWith('src/')) entryName = entryName.slice('src/'.length);

        if (entryName.endsWith('.html')) {
          entryName = entryName.slice(0, -'.html'.length);
        } else {
          entryName = entryName + '/index';
        }
        resultPath = resultPath.replaceAll('[entryName]', entryName);
      } else {
        let sharedPath = getSharedPath(chunkInfo.name, chunk.moduleIds);
        sharedPath = sharedPath ? 'shared/' + sharedPath : 'shared';
        resultPath = resultPath.replaceAll('[sharedPath]', sharedPath);
      }

      if (DEBUG) {
        console.debug(outputKey, ':', resultPath.replaceAll('[name]', chunkInfo.name), chunk);
      }
      return resultPath;
    };
  }

  return {
    appType: 'mpa',
    base: './',
    plugins: [
      solid(),
      { // Mark CSS files with their original paths
        name: 'css-path-marker',
        transform(code, id) {
          if (id.endsWith('.css')) {
            const relativePath = id.replace(resolve(__dirname) + '/', '');
            const safeId = relativePath.replace(/[^a-zA-Z0-9]/g, '-');
            // Use an ID selector and CSS variable, which are less likely to be minified away
            return `#vite-origin-${safeId} { --origin: "${relativePath}"; }\n${code}`;
          }
        }
      }
    ],
    server: {
      hmr: HMR,
    },
    build: {
      rollupOptions: {
        // Collect all HTML files in `applets/` as entries to ensure their assets are processed
        input: (() => {
          const input = sync('src/artifacts/applets/**/*.html').reduce<Record<string, string>>(
            (entryPoints, file) => {
              const isIndex = file.endsWith('index.html');
              // For applet entry (index.html), use the parent folder as the applet entry name
              // For applet sub-page (non-index.html), use the full relative path as the page name to avoid collisions
              // We KEEP 'src/' to ensure Vite calculates the correct relative path depth (..)
              let name = file;
              if (isIndex) {
                name = name.slice(0, -'index.html'.length - 1);
              }

              entryPoints[name] = resolve(__dirname, file);
              return entryPoints;
            },
            // The default entry point
            { corkeiCore: resolve(__dirname, 'index.html') }
          );
          if (DEBUG) console.debug('rollupOptions.input:', input);
          return input;
        })(),

        // Separate entry files but share chunks
        output: {
          // Keeps the entry JS inside each applet's own folder
          entryFileNames: chunkFileNames('assets/[entryName]-[hash].js'),
          // Shared libraries go into a common 'shared' tree
          chunkFileNames: chunkFileNames('[sharedPath]/[name]-[hash].js'),
          // Other assets (CSS, images, etc.) go into the applet's specific asset folder
          assetFileNames: (assetInfo) => {
            // Recover markers for CSS
            const source = typeof assetInfo.source === 'string'
              ? assetInfo.source
              : assetInfo.source?.toString() || '';
            const cssMarkers = [...source.matchAll(/--origin:\s*"(.*?)"/g)].map(m => m[1]);

            // Determine origins. Prioritize markers for CSS.
            // For CSS, originalFileNames often includes the importer (JS/HTML), so we prefer markers.
            const allOrigins = cssMarkers.length > 0
              ? [...new Set(cssMarkers)]
              : [...new Set(assetInfo.originalFileNames || [])];

            let pattern = 'assets/[name]/assets-[hash][extname]';

            if (allOrigins.length > 1) {
              // Truly shared asset, follow the common base of origins
              const sharedPath = getCommonBase(allOrigins);
              pattern = (sharedPath ? 'shared/' + sharedPath + '/' : 'shared/') + '[name]-[hash][extname]';
            } else if (allOrigins.length === 1) {
              const originPath = allOrigins[0];
              if (originPath.startsWith('src/artifacts/applets/')) {
                // Isolated applet asset (CSS, image, etc.)
                pattern = 'assets/' + originPath.slice('src/'.length);
              }
            }

            if (DEBUG) {
              const asset = { ...assetInfo, origins: allOrigins };
              asset.source = asset.source.toString().slice(0, 250);
              let name = asset.names[0].replace(/\.[^/.]+$/, "");
              console.debug('assetFileNames:', pattern.replaceAll('[name]', name), asset);
            }
            return pattern;
          },
        }
      }
    }
  }
})
