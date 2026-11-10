import { BANK_IMPORT_FAILURE_MESSAGES } from "../constants/bankImport";
import { httpStatus } from "./httpStatus";

/** Fixed words only: the server's own wording is never shown. A lost answer or a broken server says it might have saved. */
export function bankImportFailure(error: unknown): string {
  const status = httpStatus(error);
  if (status === 413) return BANK_IMPORT_FAILURE_MESSAGES.tooLarge;
  if (status === 400) return BANK_IMPORT_FAILURE_MESSAGES.notCsv;
  if (status === 422) return BANK_IMPORT_FAILURE_MESSAGES.unreadable;
  if (status === undefined || status >= 500) return BANK_IMPORT_FAILURE_MESSAGES.unsure;
  return BANK_IMPORT_FAILURE_MESSAGES.other;
}
