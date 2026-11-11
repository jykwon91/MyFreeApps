import { DATA_EXPORT_FILE_PREFIX } from "../constants/dataExport";

/** The website's name for the export: the prefix and the UTC time to the second. */
export function dataExportFileName(now: Date): string {
  return `${DATA_EXPORT_FILE_PREFIX}-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
}
