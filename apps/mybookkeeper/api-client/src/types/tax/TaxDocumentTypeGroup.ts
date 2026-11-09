import type { TaxSourceDocument } from "./TaxSourceDocument";

export interface TaxDocumentTypeGroup {
  type: string;
  docs: TaxSourceDocument[];
}
