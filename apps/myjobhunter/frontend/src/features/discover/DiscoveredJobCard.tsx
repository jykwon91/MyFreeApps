import { useState } from "react";
import { Bookmark, Briefcase, Check, ExternalLink, X } from "lucide-react";
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
  usePromoteDiscoveredJobMutation,
  useSaveDiscoveredJobMutation,
  type DismissalReason,
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

const DISMISS_REASONS: { value: DismissalReason; label: string }[] = [
  { value: "wrong_stack", label: "Wrong tech stack" },
  { value: "too_small_company", label: "Company too small" },
  { value: "wrong_sector", label: "Wrong industry / sector" },
  { value: "wrong_comp", label: "Compensation mismatch" },
  { value: "not_remote", label: "Not actually remote" },
  { value: "not_interested", label: "Not interested" },
  { value: "other", label: "Other" },
];

interface ScoreVisual {
  band: "strong" | "good" | "stretch" | "low";
  label: string;
  color: "green" | "blue" | "yellow" | "red";
}

function bandForScore(score: number | null): ScoreVisual | null {
  if (score === null) return null;
  if (score >= 85) return { band: "strong", label: "Strong fit", color: "green" };
  if (score >= 60) return { band: "good", label: "Worth considering", color: "blue" };
  if (score >= 30) return { band: "stretch", label: "Stretch", color: "yellow" };
  return { band: "low", label: "Mismatch", color: "red" };
}

export default function DiscoveredJobCard({ job }: DiscoveredJobCardProps) {
  const [dismiss, { isLoading: isDismissing }] = useDismissDiscoveredJobMutation();
  const [save, { isLoading: isSaving }] = useSaveDiscoveredJobMutation();
  const [promote, { isLoading: isPromoting }] = usePromoteDiscoveredJobMutation();
  const [showReasons, setShowReasons] = useState(false);

  async function doDismiss(reason?: DismissalReason) {
    try {
      await dismiss({ jobId: job.id, reason }).unwrap();
      setShowReasons(false);
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

  async function handlePromote() {
    try {
      await promote(job.id).unwrap();
      showSuccess("Added to Applications");
    } catch (err) {
      showError(extractErrorMessage(err) ?? "Couldn't add this to Applications");
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
  const isAlreadyPromoted = !!job.promoted_application_id;
  const scoreVisual = bandForScore(job.score);

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
        <div className="flex items-start gap-1.5 shrink-0">
          {scoreVisual && <Badge label={scoreVisual.label} color={scoreVisual.color} />}
          {job.source_publisher && (
            <Badge label={job.source_publisher} color="gray" />
          )}
        </div>
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

      {job.score_reason && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">
          {job.score_reason}
        </p>
      )}

      {job.description && (
        <p className="text-sm text-muted-foreground line-clamp-3">
          {job.description}
        </p>
      )}

      {showReasons ? (
        <div className="border rounded-md p-3 space-y-2">
          <p className="text-xs font-medium">Why are you dismissing this?</p>
          <div className="flex flex-wrap gap-1.5">
            {DISMISS_REASONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => doDismiss(r.value)}
                disabled={isDismissing}
                className="px-2 py-1 text-xs border rounded hover:bg-muted"
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => doDismiss()}
              disabled={isDismissing}
              className="text-xs text-muted-foreground hover:underline"
            >
              Skip — dismiss without a reason
            </button>
            <button
              type="button"
              onClick={() => setShowReasons(false)}
              className="text-xs text-muted-foreground hover:underline ml-auto"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-1 flex-wrap">
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
            variant="primary"
            onClick={handlePromote}
            disabled={isPromoting || isAlreadyPromoted}
          >
            {isAlreadyPromoted ? (
              <>
                <Check className="w-4 h-4 mr-1" />
                Applied
              </>
            ) : (
              <>
                <Briefcase className="w-4 h-4 mr-1" />
                Apply
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSave}
            disabled={isSaving || isAlreadySaved || isAlreadyPromoted}
          >
            <Bookmark className="w-4 h-4 mr-1" />
            {isAlreadySaved ? "Saved" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowReasons(true)}
            disabled={isDismissing}
            className="ml-auto"
            aria-label="Dismiss this posting"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}
