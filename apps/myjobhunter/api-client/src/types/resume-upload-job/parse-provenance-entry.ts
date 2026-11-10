export interface ParseProvenanceEntry {
  kind: "work_bullet" | "summary";
  work_index?: number;
  company?: string | null;
  bullet_index?: number;
  text: string;
  unsourced_terms: string[];
}
