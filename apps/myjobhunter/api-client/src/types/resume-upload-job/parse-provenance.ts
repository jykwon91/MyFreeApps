import type { ParseProvenanceEntry } from "./parse-provenance-entry";

export interface ParseProvenance {
  checked: boolean;
  flagged: ParseProvenanceEntry[];
}
