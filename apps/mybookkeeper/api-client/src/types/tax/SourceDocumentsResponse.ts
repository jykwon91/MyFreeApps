import type { ChecklistItem } from "./ChecklistItem";
import type { TaxSourceDocument } from "./TaxSourceDocument";

export interface SourceDocumentsResponse {
  documents: TaxSourceDocument[];
  checklist: ChecklistItem[];
}
