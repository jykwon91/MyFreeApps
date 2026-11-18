/** When a call never got an answer (offline, dropped, timed out): say so, rather than blaming the photo, the recipe or the search. */
export const CONNECTION_MESSAGES = {
  photoImport: "We can't reach the server. Check your connection and try again.",
  discoveryRead: "We can't reach the server to open that one. Check your connection and try again.",
  discoverySearch: "We can't reach the server. Check your connection and try again.",
  write: "Couldn't save that. We can't reach the server, so check your connection and try again.",
  diff: "We can't reach the server to load this comparison. Check your connection and try again.",
} as const;
