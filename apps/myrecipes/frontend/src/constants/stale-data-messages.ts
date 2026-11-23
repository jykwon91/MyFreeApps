/** Above data that stays on screen after a refresh failed, so old data isn't mistaken for current. */
export const STALE_DATA_MESSAGES = {
  diff: "Couldn't update this comparison. What's shown is from before.",
  recipes: "Couldn't update your recipes. What's shown is from before.",
  tryAgain: "Try again",
} as const;
