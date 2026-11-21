import { isCancelledRequest } from "@platform/core/utils/isCancelledRequest";
import { unsureRepeatableMessage } from "@platform/core/utils/unsureRepeatableMessage";
import { writeOutcome } from "@platform/core/utils/writeOutcome";

/**
 * What to say when a write that's harmless to send twice fails (a change, a delete, setting a value, answering a
 * suggestion). A lost answer or a server failure with no reason can come after it went through (see writeOutcome), so
 * that isn't called a failure: it says so, and that trying again is safe. Any other failure reads as `describe` says.
 * Null when a cache reset (sign-out, account change) called it off: there's nobody left to tell.
 */
export function repeatableWriteFailure(error: unknown, describe: (error: unknown) => string): string | null {
  if (isCancelledRequest(error)) return null;
  if (writeOutcome(error) === "unknown") return unsureRepeatableMessage("that went through");
  return describe(error);
}
