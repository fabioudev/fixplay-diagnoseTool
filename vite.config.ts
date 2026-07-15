/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const host = process.env.TAURI_DEV_HOST;

// When MOCK=1 is set, replace the Tauri API + dialog plugin with local mock
// modules so the UI can run in a plain browser (no Rust backend / hardware).
// The Tauri build (and normal `npm run dev` for the desktop app) is unaffected.
const useMock = process.env.MOCK === '1';
const mockDir = (f: string) => fileURLToPath(new URL(`./src/lib/mock/${f}`, import.meta.url));
const mockAlias: Record<string, string> = useMock
  ? {
      '@tauri-apps/api/core': mockDir('core.ts'),
      '@tauri-apps/api/event': mockDir('event.ts'),
      '@tauri-apps/plugin-dialog': mockDir('dialog.ts'),
      '@tauri-apps/plugin-updater': mockDir('updater.ts'),
      '@tauri-apps/plugin-process': mockDir('process.ts'),
    }
  : {};

// `__MOCK_MODE__` is inlined as a boolean literal so the UI can branch on it.
// In MOCK builds it becomes `true` (and the MockPanel is rendered); in the real
// Tauri build it becomes `false` so the panel and its handlers are dead code.
const mockDefine = { __MOCK_MODE__: JSON.stringify(useMock) };

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  resolve: { alias: mockAlias },
  define: mockDefine,
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    // HMR over the Cloudflare tunnel (how MOCK preview is exposed) is flaky:
    // the HMR websocket's full-reload races with the dynamic-import fetch and
    // Vite logs "Failed to fetch dynamically imported module" on every edit,
    // which SvelteKit dev renders as an opaque 500 error page. MOCK preview is
    // a stable browser view (not a live-coding session), so disable HMR there
    // — a manual reload is more reliable than the tunnelled HMR loop.
    hmr: useMock ? false : host ? { protocol: 'ws', host, port: 5183 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: 'es2020',
    minify: !process.env.TAURI_ENV_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
  },
});
