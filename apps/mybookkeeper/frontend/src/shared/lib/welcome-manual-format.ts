/**
 * Pure formatting helpers for welcome-manual list/detail views. Kept out of
 * component files per the project's "constants/config in dedicated modules"
 * rule.
 */

/** "0 sections" / "1 section" / "N sections" — pluralized. */
export function formatSectionCount(count: number): string {
  if (count === 1) return "1 section";
  return `${count} sections`;
}

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** Short, locale-aware updated date. Returns "—" for unparseable input. */
export function formatUpdatedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return DATE_FORMATTER.format(date);
}
