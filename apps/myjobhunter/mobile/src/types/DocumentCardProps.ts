import type { Document } from "@myjobhunter/api-client/types/document/document";

export interface DocumentCardProps {
  document: Document;
  onEdit: (document: Document) => void;
  /** Shows a link to the application a document is for, as the Documents list does. Left out on that application's own screen. */
  onOpenApplication?: (applicationId: string) => void;
}
