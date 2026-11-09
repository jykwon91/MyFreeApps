import type { TaxDocumentTypeGroup } from "./TaxDocumentTypeGroup";

export interface TaxDocumentYearGroup {
  year: number;
  types: TaxDocumentTypeGroup[];
}
