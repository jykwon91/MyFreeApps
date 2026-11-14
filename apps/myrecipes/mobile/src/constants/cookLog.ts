/**
 * Copy for logging a cook and the cook log on the phone. What the sheet, the list and a delete say
 * afterwards comes from the API client, worded as the website words it.
 */
export const COOK_LOG_PHONE_MESSAGES = {
  madeItHint: "Logs how this cook turned out: a rating and notes.",
  saving: "Saving…",
  cancel: "Cancel",
  loading: "Loading cook log",
  loadFailed: "Couldn't load your cook log.",
  tryAgain: "Try again",
  deleteRowLabel: (date: string) => `Delete cook log from ${date}`,
  deleteHint: "Asks before deleting this cook log.",
  gone: "This cook log was already deleted.",
  rated: (rating: number) => `rated ${rating} out of 5`,
} as const;

/** How many rows the loading cook log shows. */
export const COOK_LOG_SKELETON_ROWS = 2;
