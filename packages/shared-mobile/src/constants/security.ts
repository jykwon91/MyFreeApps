/** The Security screen's words that are the same in every app; SecurityScreenContent has the rest. */
export const SECURITY_MESSAGES = {
  screenTitle: "Security",

  dismissIntro: "Dismiss",

  displayNameHeading: "Display name",
  displayNameLabel: "Display name",
  displayNamePlaceholder: "e.g. Jane Smith",
  save: "Save",
  saving: "Saving…",
  displayNameSaved: "Display name saved.",
  displayNameSaveFailed: "Couldn't save your name. Try again.",
  displayNameLoadFailed: "I couldn't load your display name.",
  tryAgain: "Try again",
  loadingDisplayName: "Loading your display name",

  dataHeading: "Data & Privacy",
  exportHeading: "Export your data",
  exportButton: "Export my data",
  exporting: "Preparing…",
  exported: "Your data export was downloaded.",
  exportFailed: "I couldn't export your data. Try again.",
  deleteHeading: "Delete account",
  deleteBody: "Permanently delete your account and all associated data. This can't be undone.",
  deleteButton: "Delete my account",
} as const;
