import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Rapier's compat build inlines its wasm as base64: ~4.3 MB raw / ~1.7 MB gzip, by design.
    // ponytail: switch to @dimforge/rapier3d + a wasm loader plugin if download size starts to matter.
    chunkSizeWarningLimit: 4500,
    rolldownOptions: {
      output: {
        // Separate vendor chunks: game-code deploys don't invalidate the cached engine files.
        codeSplitting: {
          groups: [
            { name: 'rapier', test: /@dimforge/ },
            { name: 'three', test: /node_modules[\\/]three/ },
          ],
        },
      },
    },
  },
});
