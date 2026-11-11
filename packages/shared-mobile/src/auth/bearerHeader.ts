import type { MobileSession } from "../types/MobileSession";

/**
 * The sign-in for a request the API client can't make, such as a file download or an image.
 * It goes in a header, never in a URL, which can end up in logs and history.
 */
export function bearerHeader(session: MobileSession): Record<string, string> {
  return { Authorization: `Bearer ${session.tokenStore.get() ?? ""}` };
}
