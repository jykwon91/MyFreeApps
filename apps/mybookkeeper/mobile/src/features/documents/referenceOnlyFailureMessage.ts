import { REFERENCE_ONLY_MESSAGES as MESSAGES } from "../../constants/documents";
import { writeOutcome } from "@platform/core/utils/writeOutcome";

/** Marking sets a flag, so after a lost answer (see writeOutcome) sending it again is harmless. */
export function referenceOnlyFailureMessage(error: unknown): string {
  return writeOutcome(error) === "unknown" ? MESSAGES.unsure : MESSAGES.otherFailure;
}
