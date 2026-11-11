import { httpStatus } from "@platform/core/utils/httpStatus";
import { RATE_LIMIT_GENERIC_DETAIL, REFRESH_MESSAGES } from "../constants/discoverMessages";
import { serverDetail } from "./serverDetail";

/**
 * What to say when refreshing a saved search failed. The per-IP limit's bare 429 becomes a friendly
 * "try again in a few minutes"; JSearch's own quota 429, and every other failure, keeps the server's
 * reason, which says what to do.
 */
export function describeRefreshError(error: unknown): string {
  const detail = serverDetail(error);
  if (httpStatus(error) === 429 && (detail === null || detail === RATE_LIMIT_GENERIC_DETAIL)) return REFRESH_MESSAGES.rateLimited;
  return detail ?? REFRESH_MESSAGES.failed;
}
