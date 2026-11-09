export interface SkippedDocument {
  id: string;
  reason: "not_found" | "being_read";
}
