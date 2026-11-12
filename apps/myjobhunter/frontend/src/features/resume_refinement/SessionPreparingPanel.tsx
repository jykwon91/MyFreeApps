import { aiActionErrorMessage } from "@/lib/aiActionErrorMessage";
import { AlertTriangle, Loader2 } from "lucide-react";
import { LoadingButton, showError } from "@platform/ui";
import { useRetryPreparationMutation } from "@myjobhunter/api-client/store/resumeRefinementApi";
import SuggestionProgressBar from "@/features/resume_refinement/SuggestionProgressBar";
import { SEVERITY_BADGE_CLASS } from "@/features/resume_refinement/improvement-target-labels";
import { IMPROVEMENT_SEVERITY_LABELS } from "@myjobhunter/api-client/constants/improvementSeverityLabels";
import { refinementPreparation } from "@myjobhunter/api-client/utils/refinementPreparation";
import type { RefinementSession } from "@myjobhunter/api-client/types/resume-refinement/refinement-session";

interface SessionPreparingPanelProps {
  session: RefinementSession;
}

// Right-column card for the background-preparation window. Stage is
// derived purely from persisted session fields (status +
// improvement_targets + proposals_ready_count), so refresh /
// navigate-away-and-back recompute it correctly from the 3s poll.
// Honest progress only — no fake bars while the target count is
// unknown.
export default function SessionPreparingPanel({ session }: SessionPreparingPanelProps) {
  const [retryPreparation, retry] = useRetryPreparationMutation();
  const preparation = refinementPreparation(session);

  async function handleRetry() {
    try {
      await retryPreparation(session.id).unwrap();
    } catch (err) {
      showError(aiActionErrorMessage(err, "resumeRefinement"));
    }
  }

  if (preparation.stage === "failed") {
    return (
      <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
        <header className="flex items-center gap-2" role="status" aria-live="polite">
          <AlertTriangle className="size-5 text-destructive shrink-0" />
          <h2 className="text-sm font-semibold">
            Couldn't finish reviewing your resume
          </h2>
        </header>
        <p className="text-sm text-muted-foreground">
          Claude hit a snag while preparing your session. Nothing's been
          lost — try again.
        </p>
        <div className="flex justify-end">
          <LoadingButton
            isLoading={retry.isLoading}
            loadingText="Retrying…"
            onClick={handleRetry}
          >
            Try again
          </LoadingButton>
        </div>
      </section>
    );
  }

  // Critiquing: target count still unknown — prose + spinner, no
  // skeleton (there is no loaded structure to mirror yet).
  if (preparation.stage === "critiquing") {
    return (
      <section className="rounded-lg border border-border bg-card p-4 space-y-2">
        <header className="flex items-center gap-2" role="status" aria-live="polite">
          <Loader2 className="size-4 animate-spin text-primary shrink-0" />
          <h2 className="text-sm font-semibold">Reviewing your resume</h2>
        </header>
        <p className="text-sm text-muted-foreground">
          We're finding what's worth tightening — usually takes 15 to 30
          seconds.
        </p>
      </section>
    );
  }

  // Drafting: targets known, proposals filling the cache behind the
  // existing poll. The session unlocks as soon as the first one lands.
  const { total, ready, severities } = preparation;
  const plural = total === 1 ? "thing" : "things";

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3">
      <header className="flex items-center gap-2" role="status" aria-live="polite">
        <Loader2 className="size-4 animate-spin text-primary shrink-0" />
        <h2 className="text-sm font-semibold">
          Found {total} {plural} to improve
        </h2>
      </header>
      <div className="flex flex-wrap gap-1.5">
        {severities.map(({ severity, count }) => (
          <span
            key={severity}
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${SEVERITY_BADGE_CLASS[severity]}`}
          >
            {count}× {IMPROVEMENT_SEVERITY_LABELS[severity]}
          </span>
        ))}
      </div>
      <SuggestionProgressBar
        completed={ready}
        total={total}
        ariaLabel={`${ready} of ${total} suggestions drafted`}
      />
      <p className="text-sm text-muted-foreground">
        Drafting suggestions — {ready} of {total} ready. The review opens
        as soon as the first one's done.
      </p>
    </section>
  );
}
