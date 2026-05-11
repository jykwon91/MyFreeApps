import { useState } from "react";
import { Bookmark, Briefcase, Check, ExternalLink, Loader2, X } from "lucide-react";
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
import type { JobAnalysisVerdict } from "@/types/job-analysis/job-analysis-verdict";
import DismissReasonPopover from "./DismissReasonPopover";

interface DiscoveredJobCardProps {
  job: DiscoveredJob;
  /**
   * True when the inbox view is currently polling for fresh scores
   * (i.e. another card in the same list has score=null). Lets the
   * unscored card show a small spinner in the verdict-badge slot so
   * the operator knows the rating is in flight, not stuck. When
   * false, an unscored card shows a static "Awaiting AI score" pill
   * — same information, lower visual noise once polling stops.
   *
   * Optional for backward compatibility — defaults to false so
   * existing callers (and tests) keep their current behaviour.
   */
  isScoringInFlight?: boolean;
}

const REMOTE_LABEL: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  unknown: "",
};

interface VerdictVisual {
  label: string;
  color: "green" | "blue" | "yellow" | "red";
}

const VERDICT_VISUAL: Record<JobAnalysisVerdict, VerdictVisual> = {
  strong_fit: { label: "Strong fit", color: "green" },
  worth_considering: { label: "Worth considering", color: "blue" },
  stretch: { label: "Stretch", color: "yellow" },
  mismatch: { label: "Mismatch", color: "red" },
};

export default function DiscoveredJobCard({
  job,
  isScoringInFlight = false,
}: DiscoveredJobCardProps) {
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
  const verdictVisual = job.verdict ? VERDICT_VISUAL[job.verdict] ?? null : null;
  const isUnscored = job.verdict === null && job.score === null;

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
          {verdictVisual && <Badge label={verdictVisual.label} color={verdictVisual.color} />}
          {!verdictVisual && isUnscored && isScoringInFlight && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground border border-muted rounded"
              role="status"
              aria-live="polite"
              aria-label="Scoring in progress"
              data-testid="discovered-job-scoring-spinner"
            >
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
              <span>Scoring</span>
            </span>
          )}
          {!verdictVisual && isUnscored && !isScoringInFlight && (
            <span
              className="px-2 py-0.5 text-xs text-muted-foreground border border-muted rounded"
              data-testid="discovered-job-awaiting-score"
            >
              Awaiting AI score
            </span>
          )}
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
        <DismissReasonPopover
          onDismiss={doDismiss}
          onCancel={() => setShowReasons(false)}
          isLoading={isDismissing}
        />
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
