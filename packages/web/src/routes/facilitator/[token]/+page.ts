// The facilitator dashboard at /facilitator/<token> needs the token segment
// resolved at runtime against the live DB, so it cannot be prerendered at
// build time. The global layout sets prerender = true; override here.

export const prerender = false;
export const ssr = false;
