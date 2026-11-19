import type { DocumentsListBodyProps } from "@/shared/types/document/documents-list-body-props";
import DocumentsSkeleton from "./DocumentsSkeleton";

/** The list's skeleton on first load, nothing when it failed (ListPagesErrorAlert says so), else the table. */
export default function DocumentsListBody({ mode, canWrite, children }: DocumentsListBodyProps) {
  if (mode === "loading") return <DocumentsSkeleton canWrite={canWrite} />;
  if (mode === "error") return null;
  return <>{children}</>;
}
