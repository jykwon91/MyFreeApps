import { addDays, format } from "date-fns";

/**
 * The host's date, as the app sends it (UTC would be tomorrow on a US evening).
 * Not imported from api-client: Playwright doesn't compile workspace TS at runtime.
 */
export function localToday(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/**
 * ``offsetDays`` from the host's today as ``YYYY-MM-DD``. Negative is in the past.
 * Utility-plan and insurance endpoints use the server's own date, so these specs
 * assume the backend runs in the test host's timezone.
 */
export function localDateOffset(offsetDays: number): string {
  return format(addDays(new Date(), offsetDays), "yyyy-MM-dd");
}
