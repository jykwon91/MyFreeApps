import type { Document } from "@/types/document/document";

export interface DocumentListResponse {
  items: Document[];
  total: number;
}
