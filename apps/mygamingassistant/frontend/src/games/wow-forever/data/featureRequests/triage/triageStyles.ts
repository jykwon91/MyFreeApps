/** Class strings the triage screen repeats. */

/** A small enum chip (status, verdict, priority). */
export const TRIAGE_CHIP = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium";

/** A secondary action: outlined, 44 px tall. */
export const TRIAGE_SECONDARY_BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50";

/** The primary action: filled, 44 px, full width on a phone. */
export const TRIAGE_PRIMARY_BUTTON =
  "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50 sm:w-auto";

/** A text input / textarea at 16 px (no zoom on iOS). */
export const TRIAGE_INPUT =
  "w-full rounded-md border bg-card px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-primary";

/** A skeleton bar. */
export const TRIAGE_SKELETON_BAR = "rounded-md bg-muted/40 motion-safe:animate-pulse";
