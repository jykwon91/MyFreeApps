import type { InfiniteData } from "@reduxjs/toolkit/query";
import type { DocumentListResponse } from "../types/document/document-list-response";

/**
 * The loaded pages with one document taken out of whichever page holds it, and
 * every page's total lowered by one so the count stays right whichever page is
 * read. A document that shifted onto two loaded pages is still one document, so
 * the total drops once. Unchanged when the document isn't in a loaded page.
 */
export function withoutDocument(
  data: InfiniteData<DocumentListResponse, number>,
  id: string,
): InfiniteData<DocumentListResponse, number> {
  if (!data.pages.some((page) => page.items.some((item) => item.id === id))) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      items: page.items.filter((item) => item.id !== id),
      total: Math.max(0, page.total - 1),
    })),
  };
}
