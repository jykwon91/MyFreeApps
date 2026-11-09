import type { FormStatus } from "../types/tax/FormStatus";

/** A form is as bad as its worst check: errors first, then warnings, else valid. */
export function taxFormStatus(errors: number, warnings: number): FormStatus {
  if (errors > 0) return { tone: "error", label: `${errors} error${errors > 1 ? "s" : ""}` };
  if (warnings > 0) return { tone: "warning", label: `${warnings} warning${warnings > 1 ? "s" : ""}` };
  return { tone: "valid", label: "Valid" };
}
