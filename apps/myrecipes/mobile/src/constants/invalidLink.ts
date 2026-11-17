export const INVALID_LINK_MESSAGES = {
  heading: "Can't find that.",
  body: "The link may be old or mistyped.",
  backLabel: "Go back",
} as const;

/** Where Back goes when the screen was opened cold from a link. */
export const INVALID_LINK_FALLBACK_ROUTE = "/";
