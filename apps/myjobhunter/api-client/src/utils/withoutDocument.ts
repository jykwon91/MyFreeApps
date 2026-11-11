import type { DocumentListResponse } from "../types/document/document-list-response";

/** The list with one document taken out, its total lowered to match. Unchanged when it isn't there. */
export function withoutDocument(list: DocumentListResponse, id: string): DocumentListResponse {
  const items = list.items.filter((item) => item.id !== id);
  return { items, total: Math.max(0, list.total - (list.items.length - items.length)) };
}
