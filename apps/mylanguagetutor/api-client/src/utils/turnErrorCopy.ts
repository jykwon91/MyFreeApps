import { GENERIC_COPY, TURN_ERROR_COPY } from "../constants/turnErrorCopy";

/** Learner-facing copy for a turn failure code. */
export function turnErrorCopy(code: string): string {
  return TURN_ERROR_COPY[code] ?? GENERIC_COPY;
}
