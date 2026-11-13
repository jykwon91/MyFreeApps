import { useState } from "react";
import { useDispatch } from "react-redux";
import { ExternalLink, RotateCcw } from "lucide-react";
import { LoadingButton, showError, showSuccess } from "@platform/ui";
import { DISCOVER_ACTION_MESSAGES } from "@myjobhunter/api-client/constants/discoverMessages";
import { undoDismissDiscoveredJob } from "@myjobhunter/api-client/store/undoDismissDiscoveredJob";
import type { DiscoverCacheDispatch } from "@myjobhunter/api-client/types/discovery/discover-cache-dispatch";
import type { DiscoveredJob } from "@myjobhunter/api-client/types/discovery/discovered-job";
import { discoveredJobUrl } from "@myjobhunter/api-client/utils/discoveredJobUrl";
import { dismissalSummary } from "@myjobhunter/api-client/utils/dismissalSummary";
import { undoDismissFailureMessage } from "@myjobhunter/api-client/utils/undoDismissFailureMessage";

interface DismissedJobFooterProps {
  job: DiscoveredJob;
}

/**
 * A dismissed posting's footer in the Dismissed view: when (and why) it was dismissed, Open, and
 * Restore, which sends it back to the inbox. The card unmounts once the refetched list drops it.
 */
export default function DismissedJobFooter({ job }: DismissedJobFooterProps) {
  const dispatch = useDispatch<DiscoverCacheDispatch>();
  const [isRestoring, setIsRestoring] = useState(false);
  const summary = dismissalSummary(job);
  const postingUrl = discoveredJobUrl(job);

  async function handleRestore(): Promise<void> {
    setIsRestoring(true);
    try {
      await dispatch(undoDismissDiscoveredJob(job.id));
      showSuccess(DISCOVER_ACTION_MESSAGES.restored);
      // Stays disabled: the card unmounts once the refetched list drops it, and a second tap would 404.
    } catch (err) {
      showError(undoDismissFailureMessage(err, DISCOVER_ACTION_MESSAGES.restoreFailed));
      setIsRestoring(false);
    }
  }

  return (
    <div className="space-y-2 pt-1">
      {summary && (
        <p className="text-xs text-muted-foreground" data-testid="dismissal-summary">
          {summary}
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap" data-testid="dismissed-job-actions">
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
        <LoadingButton
          size="sm"
          variant="primary"
          onClick={handleRestore}
          isLoading={isRestoring}
          loadingText={DISCOVER_ACTION_MESSAGES.restoring}
          aria-label={`${DISCOVER_ACTION_MESSAGES.restore} ${job.title} at ${job.company_name}`}
          title={DISCOVER_ACTION_MESSAGES.restoreHint}
        >
          <RotateCcw className="w-4 h-4 mr-1" aria-hidden="true" />
          {DISCOVER_ACTION_MESSAGES.restore}
        </LoadingButton>
      </div>
    </div>
  );
}
