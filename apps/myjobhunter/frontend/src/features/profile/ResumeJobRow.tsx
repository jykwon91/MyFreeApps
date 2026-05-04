import { Download, FileText } from "lucide-react";
import { Badge } from "@platform/ui";
import type { ResumeUploadJob, ResumeUploadJobStatus } from "@/types/resume-upload-job/resume-upload-job";

export interface ResumeJobRowProps {
  job: ResumeUploadJob;
  onDownload: (jobId: string) => void;
  isDownloading: boolean;
}

const STATUS_LABELS: Record<ResumeUploadJobStatus, string> = {
  queued: "Queued",
  processing: "Processing",
  complete: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
};

// BadgeColor values from @platform/ui Badge component
type BadgeColor = "gray" | "blue" | "yellow" | "orange" | "green" | "red" | "purple";

const STATUS_COLORS: Record<ResumeUploadJobStatus, BadgeColor> = {
  queued: "gray",
  processing: "yellow",
  complete: "green",
  failed: "red",
  cancelled: "gray",
};

function formatFileSize(bytes: number | null): string {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ResumeJobRow({ job, onDownload, isDownloading }: ResumeJobRowProps) {
  const status = job.status as ResumeUploadJobStatus;

  return (
    <div className="flex items-center gap-3 py-2 group">
      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center shrink-0">
        <FileText size={14} className="text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{job.file_filename ?? "resume"}</p>
        <p className="text-xs text-muted-foreground">
          {formatTimestamp(job.created_at)}
          {job.file_size_bytes !== null ? ` · ${formatFileSize(job.file_size_bytes)}` : ""}
        </p>
        {job.error_message ? (
          <p className="text-xs text-destructive mt-0.5 truncate">{job.error_message}</p>
        ) : null}
      </div>

      <Badge label={STATUS_LABELS[status]} color={STATUS_COLORS[status]} />

      <button
        onClick={() => onDownload(job.id)}
        disabled={isDownloading}
        className="p-2 rounded hover:bg-muted min-h-[44px] min-w-[44px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
        aria-label={`Download ${job.file_filename ?? "resume"}`}
        title="Download"
      >
        <Download size={14} />
      </button>
    </div>
  );
}
