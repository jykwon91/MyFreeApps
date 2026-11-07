import { format } from "date-fns";

/**
 * The host's date, as the app sends it (UTC would be tomorrow on a US evening).
 * Not imported from api-client: Playwright doesn't compile workspace TS at runtime.
 */
export function localToday(): string {
  return format(new Date(), "yyyy-MM-dd");
}
