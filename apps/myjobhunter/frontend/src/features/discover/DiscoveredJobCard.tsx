import { useState } from "react";
import { useDispatch } from "react-redux";
import { Link } from "react-router-dom";
import { Bookmark, Briefcase, Check, ExternalLink, Loader2, X } from "lucide-react";
import { Badge, Button, Card, LoadingButton, showError, showSuccess } from "@platform/ui";
import {
  useDismissDiscoveredJobMutation,
  usePromoteDiscoveredJobMutation,
  useSaveDiscoveredJobMutation,
} from "@myjobhunter/api-client/store/discoverApi";
import { undoDismissDiscoveredJob } from "@myjobhunter/api-client/store/undoDismissDiscoveredJob";
import type { DiscoverCacheDispatch } from "@myjobhunter/api-client/types/discovery/discover-cache-dispatch";
import type { DismissalReason } from "@myjobhunter/api-client/types/discovery/dismissal-reason";
import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";
import type { DiscoverySource } from "@myjobhunter/api-client/types/discovery/discovery-source";
import { DISCOVER_ACTION_MESSAGES } from "@myjobhunter/api-client/constants/discoverMessages";
import { discoveredJobFacts } from "@myjobhunter/api-client/utils/discoveredJobFacts";
import { discoveredJobUrl } from "@myjobhunter/api-client/utils/discoveredJobUrl";
import { discoverFailureMessage } from "@myjobhunter/api-client/utils/discoverFailureMessage";
import { STATUS_TONE_BADGE_COLORS } from "@/constants/statusToneBadgeColors";
import DismissReasonPopover from "./DismissReasonPopover";

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

export default function DiscoveredJobCard({
  job,
  isScoringInFlight = false,
  profileUpdatedAt = null,
  sources = [],
}: DiscoveredJobCardProps) {
  const [dismiss, { isLoading: isDismissing }] = useDismissDiscoveredJobMutation();
  const [save, { isLoading: isSaving }] = useSaveDiscoveredJobMutation();
  const [promote, { isLoading: isPromoting }] = usePromoteDiscoveredJobMutation();
  const dispatch = useDispatch<DiscoverCacheDispatch>();
  const [showReasons, setShowReasons] = useState(false);

  async function handleUndo(): Promise<void> {
    try {
      await dispatch(undoDismissDiscoveredJob(job.id));
      showSuccess(DISCOVER_ACTION_MESSAGES.undone);
    } catch (err) {
      showError(discoverFailureMessage(err, DISCOVER_ACTION_MESSAGES.undoFailed));
    }
  }

  async function doDismiss(reason?: DismissalReason) {
    try {
      await dismiss({ jobId: job.id, reason }).unwrap();
      setShowReasons(false);
      // The shared Toaster owns the Undo toast, so it outlives this card, which
      // unmounts as soon as the refetched inbox drops the dismissed posting.
      showSuccess(DISCOVER_ACTION_MESSAGES.dismissed, {
        label: DISCOVER_ACTION_MESSAGES.undo,
        pendingLabel: DISCOVER_ACTION_MESSAGES.undoing,
        altText: DISCOVER_ACTION_MESSAGES.undoHint,
        onClick: handleUndo,
      });
    } catch (err) {
      showError(discoverFailureMessage(err, DISCOVER_ACTION_MESSAGES.dismissFailed));
    }
  }

  async function handleSave() {
    try {
      await save(job.id).unwrap();
      showSuccess(DISCOVER_ACTION_MESSAGES.saved);
    } catch (err) {
      showError(discoverFailureMessage(err, DISCOVER_ACTION_MESSAGES.saveFailed));
    }
  }

  async function handlePromote() {
    try {
      await promote(job.id).unwrap();
      showSuccess(DISCOVER_ACTION_MESSAGES.promoted);
    } catch (err) {
      showError(discoverFailureMessage(err, DISCOVER_ACTION_MESSAGES.promoteFailed));
    }
  }

  const {
    remoteLabel,
    salaryLabel,
    postedLabel,
    verdictLabel,
    verdictTone,
    isUnscored,
    isScoreStale,
    isSaved: isAlreadySaved,
    isPromoted: isAlreadyPromoted,
    sourceName: sourceBadgeLabel,
  } = discoveredJobFacts(job, profileUpdatedAt, sources);
  const postingUrl = discoveredJobUrl(job);

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
        {/* items-center so the mixed-height pills (filled Badges vs the
            outline status pills, which are ~2px taller from their border)
            share one vertical center instead of top-aligning on different
            baselines — the misalignment the operator flagged. */}
        <div className="flex items-center gap-1.5 shrink-0">
          {verdictLabel && <Badge label={verdictLabel} color={STATUS_TONE_BADGE_COLORS[verdictTone]} />}
          {isScoreStale && (
            <span
              className="px-2 py-0.5 text-xs text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-700 rounded"
              data-testid="discovered-job-score-stale"
              title="Your profile changed after this score was computed. It will be re-scored on the next pass."
            >
              Re-scoring soon
            </span>
          )}
          {!verdictLabel && isUnscored && isScoringInFlight && (
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
          {!verdictLabel && isUnscored && !isScoringInFlight && (
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
        {salaryLabel && (
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
          {postingUrl && (
            <a
              href={postingUrl}
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
            <LoadingButton
              size="sm"
              variant="primary"
              onClick={handlePromote}
              isLoading={isPromoting}
              loadingText="Adding…"
            >
              <Briefcase className="w-4 h-4 mr-1" />
              Apply
            </LoadingButton>
          )}
          <LoadingButton
            size="sm"
            variant="secondary"
            onClick={handleSave}
            isLoading={isSaving}
            loadingText="Saving…"
            disabled={isAlreadySaved || isAlreadyPromoted}
            data-testid="save-button"
          >
            <Bookmark className="w-4 h-4 mr-1" />
            {isAlreadySaved ? "Saved" : "Save"}
          </LoadingButton>
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
