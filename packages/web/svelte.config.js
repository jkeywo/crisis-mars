import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  compilerOptions: {
    // Opt all components into Svelte 5 runes mode. Runes ($state, $derived, etc.)
    // are the primary state primitive; legacy reactive declarations are not used.
    runes: true,
  },
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      // Use 200.html as the SPA fallback so the prerendered home page at
      // index.html isn't overwritten. Configure the static host to serve
      // 200.html for unmatched routes (Netlify: _redirects; Cloudflare Pages
      // and Vercel: built-in 200.html convention; GitHub Pages: use a custom
      // 404.html instead and rename).
      fallback: '200.html',
      precompress: false,
      strict: true,
    }),
    alias: {
      $shared: '../shared/src',
    },
    serviceWorker: {
      register: true,
    },
  },
};

export default config;
