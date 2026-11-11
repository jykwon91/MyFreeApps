export const REVEAL_HIDES_AFTER_MS = 60_000;

export const REVEAL_MESSAGES = {
  hint: "Hidden until you ask. They hide again after a minute, or when you leave.",
  show: "Show private details",
  showing: "Checking...",
  hide: "Hide private details",
  shownAnnouncement: "Private details shown.",
  hiddenAnnouncement: "Private details hidden.",
  prompt: "Show private details",
  offline: "I'm offline right now. I don't keep applicant details on your phone, so I need a connection.",
  nothingOnFile: "Nothing private on file.",
  reportMissing: "That report file is missing.",
  reportFailed: "I couldn't open that report.",
  openReport: "Open report",
  screeningReport: "Screening report",
} as const;
