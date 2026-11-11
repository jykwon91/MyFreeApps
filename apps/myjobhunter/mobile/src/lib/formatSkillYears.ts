/** "4 yrs", "1 yr", or null when the years aren't set. Zero years is a real answer. */
export function formatSkillYears(years: number | null): string | null {
  if (years === null) return null;
  return years === 1 ? "1 yr" : `${years} yrs`;
}
