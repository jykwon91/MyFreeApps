/** Where Cloudflare serves the widget from. The only origin, besides the app's own page, the check may load. */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/** Explicit rendering, so the page renders the widget itself once the script has loaded. */
export const TURNSTILE_SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;

/** The page's own inline script is the only other script it runs; it frames nothing but the widget. */
export const TURNSTILE_PAGE_CSP = [
  `script-src 'unsafe-inline' ${TURNSTILE_ORIGIN}`,
  `frame-src ${TURNSTILE_ORIGIN}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/** Cloudflare's tokens are up to 2048 characters; anything longer isn't one. */
export const TURNSTILE_TOKEN_MAX_LENGTH = 2048;

/** The widget's "normal" size is 300 by 65, plus a little room. */
export const TURNSTILE_FRAME_HEIGHT = 72;
export const TURNSTILE_FRAME_WIDTH = 300;

export const TURNSTILE_COPY = {
  label: "Security check",
  loading: "Loading the security check",
  failed: "The security check couldn't load. Check your connection, then try again.",
  retry: "Try the check again",
  required: "Complete the security check first.",
} as const;
