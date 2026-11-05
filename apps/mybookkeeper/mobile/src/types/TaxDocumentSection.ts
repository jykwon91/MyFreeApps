import type { TaxDocumentRow } from "./TaxDocumentRow";

export interface TaxDocumentSection {
  title: string;
  data: readonly TaxDocumentRow[];
}
