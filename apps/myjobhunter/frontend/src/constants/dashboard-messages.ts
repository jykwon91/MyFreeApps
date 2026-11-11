/** Copy for the dashboard's load error, stale board and for moving a card between stages. */
export const DASHBOARD_MESSAGES = {
  loadErrorHeading: "We couldn't load your board",
  loadErrorBody: "Something went wrong fetching your applications. Check your connection and try again.",
  retry: "Retry",
  staleBoard: "Showing the last loaded board. We couldn't refresh it.",
  move: "Move",
  moving: "Moving...",
  moveTitle: "Move to stage",
  movedTo: "Moved to",
  couldntMove: "Couldn't move card",
} as const;
