// The backend's limit on a cook's notes (app/schemas/recipe/cook_log_schemas.py), in code points as
// Pydantic counts them. Web stops typing at it; the phone counts towards it and says when it's over.
export const COOK_NOTES_MAX_LENGTH = 2000;

/** What logging a cook and its history say, worded the same on web and phone. */
export const COOK_LOG_MESSAGES = {
  madeIt: "I made it",
  logTitle: "Log a cook",
  logIntro: (versionNumber: number) => `Recording how v${versionNumber} turned out this time.`,
  ratingLabel: "How was it?",
  ratingGroupLabel: "Rating",
  starLabel: (stars: number) => `${stars} star${stars > 1 ? "s" : ""}`,
  notesLabel: "Notes",
  notesOptional: "(optional)",
  notesPlaceholder: "Too salty, needs 5 more minutes, doubled the garlic...",
  save: "Save cook",
  logged: "Cook logged.",
  couldntLog: "Couldn't log that cook — please try again.",
  historyTitle: "Cook log",
  empty: 'No cooks logged yet. Hit "I made it" after you cook this to start tracking how each version turns out.',
  deleteLabel: "Delete cook log",
  deleteTitle: "Delete cook log?",
  deleteBody: "This removes this cook record. It won't change any recipe version.",
  deleteConfirm: "Delete",
  deleted: "Cook log deleted.",
  couldntDelete: "Couldn't delete that cook log — please try again.",
} as const;
