// Static SPA: no server-side rendering. SvelteKit will pre-render the shell at
// build time and the same HTML serves every route via the SPA fallback in
// svelte.config.js.

export const prerender = true;
export const ssr = false;
export const trailingSlash = 'ignore';
