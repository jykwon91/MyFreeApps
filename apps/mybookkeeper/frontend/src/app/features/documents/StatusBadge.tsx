import { StatusBadge } from "@platform/ui";
import type { ReactElement } from "react";
import { AlertCircle } from "lucide-react";
import { DOCUMENT_STATUSES, type DocumentStatus } from "@mybookkeeper/api-client/types/document/DocumentStatus";

interface DocumentStatusBadgeProps {
  status: DocumentStatus;
  errorMessage?: string | null;
}

export default function DocumentStatusBadge({ status, errorMessage }: DocumentStatusBadgeProps): ReactElement {
  switch (status) {
    case DOCUMENT_STATUSES.PROCESSING:
    case DOCUMENT_STATUSES.EXTRACTING:
      return <StatusBadge tone="info" label="Extracting" />;
    case DOCUMENT_STATUSES.COMPLETED:
      return <span className="text-green-500" title="Completed">&#10003;</span>;
    case DOCUMENT_STATUSES.FAILED:
      return (
        <span className="inline-flex items-center gap-1.5" title={errorMessage ?? "Extraction failed"}>
          <StatusBadge tone="danger" label="Failed" />
          {errorMessage && (
            <span className="text-muted-foreground">
              <AlertCircle size={14} />
            </span>
          )}
        </span>
      );
    case DOCUMENT_STATUSES.DUPLICATE:
      return <StatusBadge tone="danger" label="Duplicate" />;
    case DOCUMENT_STATUSES.SKIPPED:
      return <StatusBadge tone="neutral" label="Read" />;
    case DOCUMENT_STATUSES.DELETED:
      return <StatusBadge tone="neutral" label="Deleted" />;
  }
}
