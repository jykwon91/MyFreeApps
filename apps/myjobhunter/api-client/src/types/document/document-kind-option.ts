import type { DocumentKind } from "./document-kind";

/** A document kind as a picker offers it. */
export interface DocumentKindOption {
  value: DocumentKind;
  label: string;
}
