import { defineConfig } from 'vite';

export default defineConfig({
  // Emscripten glue must NOT be pre-bundled. The dep optimizer relocates the
  // module, which breaks `new URL('manifold.wasm', import.meta.url)`, and it
  // chokes on manifold.js's ENVIRONMENT_IS_NODE `await import('node:module')`
  // branch. Do not "clean this up".
  optimizeDeps: { exclude: ['manifold-3d'] },

  // REQUIRED. Vite's default worker format is 'iife', which strips
  // import.meta.url and rewrites dynamic import() -- both of which
  // manifold.js relies on to locate and instantiate its wasm.
  worker: { format: 'es' },

  build: {
    target: 'es2022',
    // Vite 8 / Rolldown: this was `rollupOptions` before v8.
    rolldownOptions: { external: [/^node:/] },
  },
});
