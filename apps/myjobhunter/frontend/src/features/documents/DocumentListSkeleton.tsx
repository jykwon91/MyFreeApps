import { Skeleton } from "@platform/ui";
import { DOCUMENTS_LIST_MESSAGES as MESSAGES } from "@/constants/documents-list-messages";
import DocumentRowSkeleton from "@/features/documents/DocumentRowSkeleton";

const SKELETON_ROWS = [0, 1, 2] as const;

export interface DocumentListSkeletonProps {
  /** Include the filter bar placeholder (initial load). Omit when the real filter bar is already on screen. */
  withFilterBar?: boolean;
}

/** Placeholder shaped like the document list: filter bar above rows of the same structure. */
export default function DocumentListSkeleton({ withFilterBar = false }: DocumentListSkeletonProps) {
  return (
    <div className="space-y-3" role="status">
      <span className="sr-only">{MESSAGES.loadingDocuments}</span>
      {withFilterBar ? (
        <div data-testid="document-filter-skeleton">
          <Skeleton className="h-11 w-full sm:w-40 rounded-md" />
        </div>
      ) : null}
      <div className="space-y-2">
        {SKELETON_ROWS.map((row) => (
          <DocumentRowSkeleton key={row} />
        ))}
      </div>
    </div>
  );
}
