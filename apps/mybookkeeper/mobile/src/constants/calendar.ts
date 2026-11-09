export const CALENDAR_LISTINGS_CHECK = { limit: 1, offset: 0 };
export const CALENDAR_OPEN_RETRY_LIMIT = 5;
export const CALENDAR_OPEN_RETRY_MS = 100;
export const CALENDAR_SKELETON_GROUPS = [
  { key: "a", rows: ["a1", "a2"] },
  { key: "b", rows: ["b1"] },
];

export const CALENDAR_MESSAGES = {
  loading: "Loading your calendar",
  couldntLoad: "I couldn't load the calendar.",
  checkConnection: "Check your connection and try again.",
  tryAgain: "Try again",
  noListingsHeading: "I don't see any listings yet.",
  noListingsBody: "Add one on the website and I'll show its bookings here.",
  openWebsite: "Open on the website",
  reviewQueue: "Review queue",
  reviewBookings: "Review",
  today: "Today",
  openLease: "Open lease",
  close: "Close",
  notes: "Notes",
  lastUpdated: "Last updated",
  lastSynced: "Last synced",
  emptyMonthBody: "Bookings from Airbnb, VRBO and your other channels show up here after they sync.",
} as const;
