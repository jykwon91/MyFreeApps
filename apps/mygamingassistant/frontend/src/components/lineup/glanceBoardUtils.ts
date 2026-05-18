/**
 * glanceBoardUtils — pure helpers shared between GlanceBoard and its siblings.
 *
 * Extracted into its own module so that GlanceBoard.tsx does not export a
 * non-component value from a component file (fixes react-refresh/only-export-components).
 */

/** Returns the DOM id used as a scroll anchor for a given zone slug. */
export function zoneAnchorId(zoneSlug: string): string {
  return `glance-zone-${zoneSlug}`;
}
