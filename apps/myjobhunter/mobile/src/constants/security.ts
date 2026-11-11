export const SECURITY_ROUTE = "/security";
export const DELETE_ACCOUNT_ROUTE = "/delete-account";

/** What two-step sign-in protects, finishing "A code from an authenticator app protects …". */
export const WHAT_TWO_STEP_PROTECTS = "your job applications and personal data";

/** Where the phone remembers the two-step intro was dismissed. */
export const SECURITY_INTRO_DISMISSED_KEY = "mjh_security_info_dismissed";

export const SECURITY_MESSAGES = {
  screenTitle: "Security",
  backTitle: "More",

  intro:
    "Two-step sign-in adds an extra layer of security to your account. I recommend turning it on to protect your job applications and personal data.",
  dismissIntro: "Dismiss",

  displayNameHeading: "Display name",
  displayNameBody: "Shown in your profile and on exported data. Use the name you want employers and contacts to see.",
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
  exportBody: "A JSON copy of your profile, applications, companies, documents, and connected job-board metadata.",
  exportButton: "Export my data",
  exporting: "Preparing…",
  exported: "Your data export was downloaded.",
  exportFailed: "I couldn't export your data. Try again.",
  deleteHeading: "Delete account",
  deleteBody: "Permanently delete your account and all associated data. This can't be undone.",
  deleteButton: "Delete my account",
} as const;
