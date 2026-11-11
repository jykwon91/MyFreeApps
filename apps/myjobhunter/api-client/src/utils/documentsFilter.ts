import type { DocumentKindFilter } from "../types/document/document-kind-filter";
import type { DocumentsFilter } from "../types/document/documents-filter";

/** GET /documents' filters for the chosen type, narrowed to one application when given. Every type sends no `kind`. */
export function documentsFilter(kind: DocumentKindFilter, applicationId?: string): DocumentsFilter {
  return {
    ...(applicationId ? { application_id: applicationId } : {}),
    ...(kind === "all" ? {} : { kind }),
  };
}
