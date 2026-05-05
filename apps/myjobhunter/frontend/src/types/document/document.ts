import type { DocumentKind } from "@/types/document/document-kind";

export interface Document {
  id: string;
  user_id: string;
  application_id: string | null;
  title: string;
  kind: DocumentKind;
  body: string | null;
  filename: string | null;
  content_type: string | null;
  size_bytes: number | null;
  has_file: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}
