import fs from 'node:fs';
import path from 'node:path';
import basicSsl from '@vitejs/plugin-basic-ssl';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * DEV ONLY: serve the git-ignored local plan rasters (.plans-cache/) at /__plans/ for
 * overlay.html. Never active in `vite build`, so nothing from the plans can be shipped.
 */
function localPlans(): Plugin {
  const dir = path.resolve(import.meta.dirname, '.plans-cache');
  return {
    name: 'local-plans',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__plans/', (req, res, next) => {
        const name = path.basename(decodeURIComponent((req.url ?? '').split('?')[0] ?? ''));
        const file = path.join(dir, name);
        if (!/^sheet-\d\d@\d+x\.(png|json)$/.test(name) || !fs.existsSync(file)) {
          next();
          return;
        }
        res.setHeader('Content-Type', name.endsWith('.png') ? 'image/png' : 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

// GitHub Pages serves the site from https://<user>.github.io/house-sim/.
export default defineConfig(({ command, mode, isPreview }) => ({
  // Production build + `vite preview` use the Pages sub-path; `npm run dev` serves at /.
  base: command === 'build' || isPreview ? '/house-sim/' : '/',
  // `npm run dev:https` → self-signed HTTPS on the LAN (needed for some phone APIs).
  plugins: [localPlans(), ...(mode === 'https' ? [basicSsl()] : [])],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    // Only index.html is an entry: overlay.html (dev-only, uses local plan rasters) is
    // never part of the production build.
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
}));
