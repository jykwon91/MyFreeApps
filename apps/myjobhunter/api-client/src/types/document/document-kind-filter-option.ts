import type { DocumentKindFilter } from "./document-kind-filter";

/** A choice in the Documents list's type filter. */
export interface DocumentKindFilterOption {
  value: DocumentKindFilter;
  label: string;
}
