import type { Document } from "./document";

export interface DocumentListResponse {
  items: Document[];
  total: number;
}
