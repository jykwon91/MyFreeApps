import { useState } from "react";
import { Link } from "react-router-dom";
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
import type { DiscoverySource } from "@/types/discovery/discovery-source";
import type { JobAnalysisVerdict } from "@/types/job-analysis/job-analysis-verdict";
import DismissReasonPopover from "./DismissReasonPopover";
import UndoDismissToast from "./UndoDismissToast";

interface DiscoveredJobCardProps {
  job: DiscoveredJob;
  /**
   * True only during the BOUNDED window right after a refresh the client
   * itself triggered (and which the inbox times out — see
   * ``DiscoverInboxView``). While true, an unscored card shows a small
   * animated spinner so the operator sees their fresh postings are being
   * rated. While false — the steady state — an unscored card shows a
   * STATIC "Not scored" pill with no animation, because most fetched rows
   * never get scored (the scorer only rates the daily prefilter top-N) and
   * a perpetual spinner would falsely read as "stuck". The pill is a real
   * terminal state, not a spinner that never resolves.
   *
   * Optional for backward compatibility — defaults to false so existing
   * callers (and tests) get the static, non-animated state.
   */
  isScoringInFlight?: boolean;
  /**
   * ISO timestamp of the last profile update (from GET /profile
   * ``updated_at``). When this is more recent than ``job.scored_at``,
   * the card's existing score was computed against an older profile
   * snapshot and the worker will re-score on its next pass.
   *
   * Optional — defaults to null so callers that don't have the
   * profile loaded yet show no staleness signal.
   */
  profileUpdatedAt?: string | null;
  /**
   * All saved searches for the current user. Used to derive the
   * source-name badge from ``job.discovery_source_id``.
   *
   * Optional — defaults to empty array so tests and callers that
   * don't thread sources show no source badge.
   */
  sources?: DiscoverySource[];
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
  profileUpdatedAt = null,
  sources = [],
}: DiscoveredJobCardProps) {
  const [dismiss, { isLoading: isDismissing }] = useDismissDiscoveredJobMutation();
  const [save, { isLoading: isSaving }] = useSaveDiscoveredJobMutation();
  const [promote, { isLoading: isPromoting }] = usePromoteDiscoveredJobMutation();
  const [showReasons, setShowReasons] = useState(false);
  const [undoToastOpen, setUndoToastOpen] = useState(false);

  async function doDismiss(reason?: DismissalReason) {
    try {
      await dismiss({ jobId: job.id, reason }).unwrap();
      setShowReasons(false);
      setUndoToastOpen(true);
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

  // A scored card is "stale" when the operator has updated their profile
  // AFTER the score was computed. The worker will re-score on its next pass;
  // this pill lets the operator know the current score may not reflect their
  // latest skills/experience without waiting for the worker to run.
  // Only applies when the card actually has a score — truly unscored cards
  // already show the "Not scored" pill / the bounded scoring spinner.
  const isScoreStale =
    !isUnscored &&
    job.scored_at !== null &&
    profileUpdatedAt !== null &&
    new Date(profileUpdatedAt) > new Date(job.scored_at);

  // Resolve the source name for the secondary badge. Look up by
  // discovery_source_id against the already-fetched sources list — no
  // extra network call. Falls back to null (no badge) for legacy rows.
  const matchedSource = job.discovery_source_id
    ? sources.find((s) => s.id === job.discovery_source_id) ?? null
    : null;
  const sourceBadgeLabel = matchedSource
    ? matchedSource.name || matchedSource.source
    : null;

  return (
    <>
    <UndoDismissToast
      jobId={job.id}
      open={undoToastOpen}
      onOpenChange={setUndoToastOpen}
    />
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
        {/* items-center so the mixed-height pills (filled Badges vs the
            outline status pills, which are ~2px taller from their border)
            share one vertical center instead of top-aligning on different
            baselines — the misalignment the operator flagged. */}
        <div className="flex items-center gap-1.5 shrink-0">
          {verdictVisual && <Badge label={verdictVisual.label} color={verdictVisual.color} />}
          {isScoreStale && (
            <span
              className="px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 rounded"
              data-testid="discovered-job-score-stale"
              title="Your profile changed after this score was computed. It will be re-scored on the next pass."
            >
              Re-scoring soon
            </span>
          )}
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
              title="Not scored yet. The AI rates the most promising postings each day; the rest stay unscored until the next pass."
            >
              Not scored
            </span>
          )}
          {job.source_publisher && (
            <Badge label={job.source_publisher} color="gray" />
          )}
          {sourceBadgeLabel && (
            <span data-testid="source-name-badge">
              <Badge label={sourceBadgeLabel} color="gray" />
            </span>
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
          {isAlreadyPromoted ? (
            <>
              <span
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 rounded min-h-[44px] sm:min-h-[32px]"
                data-testid="promoted-applied-badge"
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                Applied
              </span>
              <Link
                to={`/applications/${job.promoted_application_id}`}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border rounded hover:bg-muted min-h-[44px] sm:min-h-[32px]"
                data-testid="view-application-link"
              >
                View application
              </Link>
            </>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={handlePromote}
              disabled={isPromoting}
            >
              <Briefcase className="w-4 h-4 mr-1" />
              Apply
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={handleSave}
            disabled={isSaving || isAlreadySaved || isAlreadyPromoted}
            data-testid="save-button"
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
    </>
  );
}
