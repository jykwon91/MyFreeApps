import type { DocumentKind } from "./document-kind";

/** Optional filters accepted by GET /documents. */
export interface DocumentsFilter {
  application_id?: string;
  kind?: DocumentKind;
}
