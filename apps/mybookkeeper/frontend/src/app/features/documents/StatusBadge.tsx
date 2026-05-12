import { StatusBadge } from "@platform/ui";
import { AlertCircle } from "lucide-react";

interface DocumentStatusBadgeProps {
  status: string;
  errorMessage?: string | null;
}

export default function DocumentStatusBadge({ status, errorMessage }: DocumentStatusBadgeProps) {
  switch (status) {
    case "processing":
    case "extracting":
      return <StatusBadge tone="info" label="Extracting" />;
    case "completed":
      return <span className="text-green-500" title="Completed">&#10003;</span>;
    case "failed":
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
    case "duplicate":
      return <StatusBadge tone="danger" label="Duplicate" />;
    default:
      return <StatusBadge tone="neutral" label={status} />;
  }
}
