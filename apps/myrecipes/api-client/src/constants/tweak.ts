/** Saving a tweak (POST /recipes/{id}/versions), worded the same on the website and the phone. */
export const TWEAK_MESSAGES = {
  saved: "New version saved.",
  couldntSave: "Couldn't save this tweak — please try again.",
  changedOrNotYours: "This recipe has changed or is no longer yours. Go back to it and try again.",
  checkEntries: "Some of what you entered couldn't be saved. Check your entries and try again.",
  signInAgain: "You've been signed out. Sign in again to save this tweak.",
} as const;
