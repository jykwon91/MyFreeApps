import { Bookmark, ExternalLink, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  formatSalaryRange,
  showError,
  showSuccess,
  timeAgo,
  extractErrorMessage,
} from "@platform/ui";
import {
  useDismissDiscoveredJobMutation,
  useSaveDiscoveredJobMutation,
} from "@/store/discoverApi";
import type { DiscoveredJob } from "@/types/discovery/discovered-job";

interface DiscoveredJobCardProps {
  job: DiscoveredJob;
}

const REMOTE_LABEL: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "",
};

export default function DiscoveredJobCard({ job }: DiscoveredJobCardProps) {
  const [dismiss, { isLoading: isDismissing }] = useDismissDiscoveredJobMutation();
  const [save, { isLoading: isSaving }] = useSaveDiscoveredJobMutation();

  async function handleDismiss() {
    try {
      await dismiss(job.id).unwrap();
    } catch (err) {
      showError(extractErrorMessage(err) ?? "Couldn't dismiss this posting");
    }
  }

  async function handleSave() {
    try {
      await save(job.id).unwrap();
      showSuccess("Saved");
    } catch (err) {
      showError(extractErrorMessage(err) ?? "Couldn't save this posting");
    }
  }

  const remoteLabel = REMOTE_LABEL[job.remote_type] ?? "";
  const salaryLabel = formatSalaryRange(
    job.salary_min !== null ? String(job.salary_min) : null,
    job.salary_max !== null ? String(job.salary_max) : null,
    job.salary_currency ?? "USD",
    job.salary_period,
  );
  const hasSalary = salaryLabel && salaryLabel !== "—";
  const postedLabel = job.posted_at ? timeAgo(job.posted_at) : null;
  const isAlreadySaved = !!job.saved_at;

  return (
    <Card className="p-4 sm:p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-base leading-snug truncate">
            {job.title}
          </h3>
          <p className="text-sm text-muted-foreground truncate">
            {job.company_name}
            {job.location ? ` — ${job.location}` : ""}
          </p>
        </div>
        {job.source_publisher && (
          <Badge label={job.source_publisher} color="gray" />
        )}
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {remoteLabel && <span>{remoteLabel}</span>}
        {hasSalary && (
          <>
            <span aria-hidden="true">•</span>
            <span>{salaryLabel}</span>
          </>
        )}
        {postedLabel && (
          <>
            <span aria-hidden="true">•</span>
            <span>Posted {postedLabel}</span>
          </>
        )}
      </div>

      {job.description && (
        <p className="text-sm text-muted-foreground line-clamp-3">
          {job.description}
        </p>
      )}

      <div className="flex items-center gap-2 pt-1">
        {job.source_url && (
          <a
            href={job.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded hover:bg-muted min-h-[44px] sm:min-h-[32px]"
          >
            <ExternalLink className="w-4 h-4" />
            Open
          </a>
        )}
        <Button
          size="sm"
          variant="secondary"
          onClick={handleSave}
          disabled={isSaving || isAlreadySaved}
        >
          <Bookmark className="w-4 h-4 mr-1" />
          {isAlreadySaved ? "Saved" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleDismiss}
          disabled={isDismissing}
          className="ml-auto"
          aria-label="Dismiss this posting"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}
