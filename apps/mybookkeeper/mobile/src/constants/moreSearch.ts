/** Sign out and devices are on this screen, in the account section that search hides. */
export const MORE_ACCOUNT_HREF = "/more";

export const MORE_SEARCH_MESSAGES = {
  label: "Search every screen",
  placeholder: "Search screens, like rent, 1099 or vendors",
  emptyHeading: (query: string): string => `Nothing matches "${query}"`,
  emptyBody: "Try a shorter word, or clear the search to browse the whole menu.",
  count: (total: number): string => (total === 1 ? "1 result" : `${total} results`),
} as const;

/** How long typing has to pause before a screen reader is told the new result count. */
export const MORE_SEARCH_ANNOUNCE_DELAY_MS = 500;
