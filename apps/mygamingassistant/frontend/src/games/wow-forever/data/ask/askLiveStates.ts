/** How a live-data card (auction prices, server status) came out: data, nothing for the region, or the fetch failed. */
export const ASK_LIVE = {
  ready: "ready",
  none: "none",
  error: "error",
} as const;
