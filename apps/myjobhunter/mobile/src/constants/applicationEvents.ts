/** Copy for the activity timeline and the log-event and edit-interview sheets. */
export const APPLICATION_EVENT_MESSAGES = {
  title: "Activity",
  logEvent: "Log event",
  none: "No events yet.",
  couldntLoad: "I couldn't load the activity.",
  tryAgain: "Try again",
  loading: "Loading the activity",
  via: "via",
  edit: "Edit interview details",
  logTitle: "Log event",
  editTitle: "Edit interview details",
  eventLabel: "Event",
  whenLabel: "When",
  noteLabel: "Note",
  notePlaceholder: "Anything to remember about this event…",
  cancel: "Cancel",
  logging: "Logging…",
  logged: "Event logged.",
  couldntLog: "I couldn't log that event. Want to try again?",
  saveChanges: "Save changes",
  saving: "Saving…",
  updated: "Interview details updated.",
  couldntUpdate: "I couldn't save those changes. Want to try again?",
  whenRequired: "Choose when it happened.",
  interviewDetails: "Interview details",
  typeLabel: "Type",
  typeRequired: "Pick the interview type.",
  scheduledLabel: "Scheduled at",
  durationLabel: "Duration (minutes)",
  durationPlaceholder: "e.g. 60",
  locationLabel: "Location or link",
  locationPlaceholder: "https://meet.google.com/… or 123 Main St",
  interviewersLabel: "Interviewer names",
  interviewersHint: "One per line",
  summaryType: "Type",
  summaryScheduled: "Scheduled",
  summaryDuration: "Duration",
  summaryWhere: "Where",
  summaryWith: "With",
  minutes: "min",
} as const;

/** "Between 1 and 1440" for the interview duration. */
export function durationRangeMessage(min: number, max: number): string {
  return `Between ${min} and ${max}.`;
}

export function tooManyInterviewersMessage(max: number): string {
  return `List up to ${max} interviewers.`;
}

export function interviewerNameTooLongMessage(max: number): string {
  return `Keep each name to ${max} characters.`;
}
