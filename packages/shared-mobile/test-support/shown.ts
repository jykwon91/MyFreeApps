/**
 * Finds text that is on screen but skipped by screen readers, such as a form field's error: the
 * input's accessibility hint reads it, so the visible copy isn't a second stop.
 */
export const SHOWN = { includeHiddenElements: true } as const;
