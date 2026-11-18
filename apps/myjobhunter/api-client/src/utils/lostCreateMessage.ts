import { isNoResponse } from "@platform/core/utils/isNoResponse";
import type { LostCreateCheck } from "../types/write/lost-create-check";
import type { LostCreateCopy } from "../types/write/lost-create-copy";
import { unsureSavedMessage } from "./unsureSavedMessage";

/**
 * What to say once an add whose answer was lost has been checked: the plain failure when it's not on the server, or
 * that it may have saved when the server couldn't be asked. Null when it was made after all (the caller carries on
 * as if it had been answered) or the check was called off.
 */
export function lostCreateMessage(check: LostCreateCheck<unknown>, error: unknown, { failed, checkWhere }: LostCreateCopy): string | null {
  if (check.kind === "notCreated") return failed;
  if (check.kind === "unknown") return unsureSavedMessage(checkWhere, isNoResponse(error));
  return null;
}
