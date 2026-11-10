import type { Document } from "@myjobhunter/api-client/types/document/document";

export interface DocumentCardProps {
  document: Document;
  onEdit: (document: Document) => void;
}
