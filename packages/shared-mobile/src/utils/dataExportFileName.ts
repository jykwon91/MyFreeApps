/** The website's name for the export, e.g. myrecipes-export-2026-11-11T09-30-00.json: the prefix and the UTC time to the second. */
export function dataExportFileName(prefix: string, now: Date): string {
  return `${prefix}-${now.toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
}
