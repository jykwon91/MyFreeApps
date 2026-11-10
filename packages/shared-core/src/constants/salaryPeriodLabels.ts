/**
 * Display label for each canonical salary period. Lookup is forgiving —
 * unknown periods (or null) fall through to an empty string instead of
 * throwing.
 */
export const SALARY_PERIOD_LABELS: Record<string, string> = {
  annual: "/ year",
  hourly: "/ hour",
  monthly: "/ month",
};
