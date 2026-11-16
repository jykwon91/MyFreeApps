// Same as the web Toaster.
export const TOAST_DEFAULT_DURATION_MS = 6000;

/** Above the screen's bottom edge, clear of the tab bar and of a screen's bottom action bar. */
export const TOAST_CLEARANCE = 76;

/**
 * With a screen reader on, a toast without an action lasts this long. Reading the message
 * aloud plus a few swipes to the dismiss button takes well over 6 s; 15 s is in the 10-20 s
 * range platform guidance gives for accessibility timeouts. A toast with an action never times out.
 */
export const TOAST_SCREEN_READER_DURATION_MS = 15000;
