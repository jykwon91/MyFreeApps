import type { ParseProvenanceEntry } from "../types/resume-upload-job/parse-provenance-entry";

/** Where a flagged line came from: the summary, or the role's company. */
export function parseProvenancePlace(entry: Pick<ParseProvenanceEntry, "kind" | "company">): string {
  return entry.kind === "summary" ? "the summary" : (entry.company ?? "a role");
}
