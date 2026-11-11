import { extractErrorMessage } from "@platform/ui";
import { rateLimitedMessage } from "@myjobhunter/api-client/utils/rateLimitedMessage";
import type { RateLimitedAction } from "@myjobhunter/api-client/types/rate-limited-action";

/**
 * What a toast says when a paid AI action failed: the plain rate-limit message on a 429, otherwise
 * the server's own message after `prefix`.
 */
export function aiActionErrorMessage(error: unknown, action: RateLimitedAction, prefix = ""): string {
  return rateLimitedMessage(error, action) ?? `${prefix}${extractErrorMessage(error)}`;
}
