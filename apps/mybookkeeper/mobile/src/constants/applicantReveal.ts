export const REVEAL_HIDES_AFTER_MS = 60_000;

export const REVEAL_MESSAGES = {
  hint: "Hidden until you ask. They hide again after a minute, or when you leave.",
  show: "Show private details",
  showing: "Checking...",
  hide: "Hide private details",
  shownAnnouncement: "Private details shown.",
  hiddenAnnouncement: "Private details hidden.",
  prompt: "Show private details",
  couldntConfirm: "I couldn't confirm it's you. Want me to try again?",
  offline: "I'm offline right now. I don't keep applicant details on your phone, so I need a connection.",
  nothingOnFile: "Nothing private on file.",
  reportMissing: "That report file is missing.",
  reportFailed: "I couldn't open that report.",
  openReport: "Open report",
  screeningReport: "Screening report",
} as const;

/** The person backed out of the prompt, or the system took it away: nothing went wrong. */
export const REVEAL_QUIET_AUTH_ERRORS: readonly string[] = ["user_cancel", "system_cancel", "app_cancel"];
