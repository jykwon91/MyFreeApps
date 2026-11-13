/** The badge on a recipe in the list: "v3", or "Draft" while it has no version yet. */
export function versionBadgeLabel(latestVersionNumber: number | null): string {
  return latestVersionNumber === null ? "Draft" : `v${latestVersionNumber}`;
}
