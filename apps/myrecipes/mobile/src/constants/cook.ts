/** Past this, reopening a recipe starts over rather than showing yesterday's ticks. */
export const COOK_SESSION_MAX_AGE_MS = 6 * 60 * 60 * 1000;
export const COOK_TARGET_HEIGHT = 56;
export const COOK_STEP_LINE_HEIGHT = 34;
export const COOK_LABEL_MAX_SCALE = 1.5;
export const COOK_TIMER_MAX_SECONDS = 24 * 60 * 60;
export const COOK_TIMER_MIN_SECONDS = 5;
export const COOK_TIMER_CONFIRM_MS = 4000;
export const COOK_TIMER_CONFIRM_SCREEN_READER_MS = 10000;
export const COOK_TIMER_CHANNEL_ID = "cook-timers";
/** Recipes saved for cooking without a connection: the most recently opened, one copy each. */
export const COOK_COPY_LIMIT = 10;
export const COOK_COPY_DIRECTORY = "cook-copies";
export const COOK_COPY_MESSAGES = {
  offlineNotice: "You're offline, so this is the copy saved on this phone. It may be out of date.",
  cookSavedCopy: "Cook the saved copy",
  savedHeading: "Saved for cooking offline",
  cookTitle: (title: string) => `Cook ${title}`,
} as const;
