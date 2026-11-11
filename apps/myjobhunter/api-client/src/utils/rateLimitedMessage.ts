import { httpStatus } from "@platform/core/utils/httpStatus";
import { RATE_LIMITED_MESSAGES } from "../constants/rateLimitedMessages";
import type { RateLimitedAction } from "../types/rate-limited-action";

/** The plain message for a 429 on `action`, or null when the error is anything else. */
export function rateLimitedMessage(error: unknown, action: RateLimitedAction): string | null {
  return httpStatus(error) === 429 ? RATE_LIMITED_MESSAGES[action] : null;
}
