/**
 * The descending list of years for a year picker. It takes the years that have data (from the
 * unfiltered years endpoint), so picking a year can never remove the others. The current year
 * is always there, so "this year" can be chosen before any data exists for it.
 */
export function dashboardYears(dataYears: readonly number[] | undefined, currentYear: number): number[] {
  const years = new Set<number>([currentYear]);
  for (const year of dataYears ?? []) {
    if (Number.isInteger(year) && year > 1900) years.add(year);
  }
  return Array.from(years).sort((a, b) => b - a);
}
