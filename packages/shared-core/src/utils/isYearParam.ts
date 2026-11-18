const YEAR_PATTERN = /^\d{4}$/;

/** Whether a route param is a four-digit calendar year, not a missing value or garbage that would become NaN. */
export function isYearParam(value: unknown): value is string {
  return typeof value === "string" && YEAR_PATTERN.test(value);
}
