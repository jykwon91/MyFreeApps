/**
 * Compact mode (?compact=1) is a bare window for a second monitor. 1024x640 is
 * the smallest such window that still shows the map page's minimap column (it
 * appears at the lg breakpoint, 1024px).
 */
export const COMPACT_VIEWPORT = { width: 1024, height: 640 } as const;

/** A narrow compact window: below the lg breakpoint, so the minimap column is gone and one column of cards remains. */
export const COMPACT_NARROW_VIEWPORT = { width: 480, height: 720 } as const;
