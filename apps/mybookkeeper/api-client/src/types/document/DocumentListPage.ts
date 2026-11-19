import type { Document } from "./document";

/** One page of GET /documents/page: its documents, and how many match across every page. */
export interface DocumentListPage {
  items: Document[];
  total: number;
  has_more: boolean;
}
