/** A draft line without its bold and italic marks, so "**Staff Engineer** — Acme" matches "Staff Engineer — Acme". */
export function plainDraftText(line: string): string {
  return line.replace(/\*\*?/g, "").trim();
}
