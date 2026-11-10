import { BANK_CSV_MAX_BYTES } from "@mybookkeeper/api-client/constants/bankImport";
import { BANK_IMPORT_MESSAGES as MESSAGES } from "../../constants/bankImport";
import type { FileForUpload } from "../../types/FileForUpload";

/** What's wrong with a chosen file, caught before it's sent. The server turns the same files away. */
export function bankCsvProblem(file: FileForUpload): string | null {
  if (!file.name.toLowerCase().endsWith(".csv")) return MESSAGES.notCsv;
  if (file.size !== undefined && file.size > BANK_CSV_MAX_BYTES) return MESSAGES.tooBig;
  return null;
}
