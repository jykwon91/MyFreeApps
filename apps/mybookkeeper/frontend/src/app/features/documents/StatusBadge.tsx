import Badge from "@/shared/components/ui/Badge";
import { AlertCircle } from "lucide-react";

interface StatusBadgeProps {
  status: string;
  errorMessage?: string | null;
}

export default function StatusBadge({ status, errorMessage }: StatusBadgeProps) {
  switch (status) {
    case "processing":
    case "extracting":
      return <Badge label="Extracting" color="blue" />;
    case "completed":
      return <span className="text-green-500" title="Completed">&#10003;</span>;
    case "failed":
      return (
        <span className="inline-flex items-center gap-1.5" title={errorMessage ?? "Extraction failed"}>
          <Badge label="Failed" color="red" />
          {errorMessage && (
            <span className="text-muted-foreground">
              <AlertCircle size={14} />
            </span>
          )}
        </span>
      );
    case "duplicate":
      return <Badge label="Duplicate" color="red" />;
    default:
      return <Badge label={status} color="gray" />;
  }
}
