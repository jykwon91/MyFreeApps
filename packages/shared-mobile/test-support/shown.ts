/**
 * Includes text that screen readers skip, so a check that a message never shows can't pass just because
 * the message is hidden from them.
 */
export const SHOWN = { includeHiddenElements: true } as const;
