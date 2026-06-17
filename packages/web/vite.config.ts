import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

const sharedPkg = resolve(__dirname, '../shared');

export default defineConfig({
  plugins: [sveltekit()],
  envPrefix: 'PUBLIC_',
  server: {
    fs: {
      // Allow Vite to read the sibling workspace package (@crisis-mars/shared).
      // Narrow allow-list rather than the default '..' to keep the dev server
      // surface area small.
      allow: [sharedPkg],
    },
  },
});
