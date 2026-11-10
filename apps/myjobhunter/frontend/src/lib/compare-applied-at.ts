/**
 * Orders two applied_at timestamps oldest first, with not-yet-applied (null or
 * blank, as formatAppliedDate treats them) last. Sorts on the instant rather than
 * the localized text, which would put 10/2 before 9/30.
 */
export function compareAppliedAt(a: string | null | undefined, b: string | null | undefined): number {
  if (!a) return b ? 1 : 0;
  if (!b) return -1;
  return Date.parse(a) - Date.parse(b);
}
