import type { Document } from "../types/document/document";
import type { DocumentSelectionRef } from "../types/document/DocumentSelectionRef";

export function toDocumentSelectionRef({ id, status }: Document): DocumentSelectionRef {
  return { id, status };
}
