/** How an item gets into the compare page. Searching the game files is the default. */
export const INPUT_MODE = {
  SEARCH: "search",
  SCREENSHOT: "screenshot",
  TEXT: "text",
} as const;

export type InputMode = (typeof INPUT_MODE)[keyof typeof INPUT_MODE];

// Search works everywhere (no network call beyond this site, so the Discord
// Activity too); a screenshot covers items the files don't have or have
// changed; pasting is for tooltips copied from a website.
export const INPUT_MODES: readonly { id: InputMode; label: string }[] = [
  { id: INPUT_MODE.SEARCH, label: "Search by name" },
  { id: INPUT_MODE.SCREENSHOT, label: "From a screenshot" },
  { id: INPUT_MODE.TEXT, label: "Paste text" },
];
