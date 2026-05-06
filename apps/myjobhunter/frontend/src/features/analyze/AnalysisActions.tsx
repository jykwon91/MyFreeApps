/**
 * Decision row at the bottom of the analysis result.
 *
 * Three affordances, in priority order:
 *   1. Primary  — "Add to applications" — creates the Application via
 *                 POST /jobs/analyze/{id}/apply, then routes to
 *                 /applications.
 *   2. Secondary — "Analyze another" — clears the page state and
 *                 returns to the input step.
 *   3. Tertiary — "Saved — view applications" — surfaces ONLY when the
 *                 analysis already has an applied_application_id, in
 *                 place of (1) and (2).
 *
 * Everything is button-style for consistency. The primary action uses
 * LoadingButton so the operator sees the spinner during the round-trip.
 */
import { LoadingButton } from "@platform/ui";

interface AnalysisActionsProps {
  appliedApplicationId: string | null;
  applying: boolean;
  onApply: () => void;
  onAnalyzeAnother: () => void;
  onViewApplications: () => void;
}

export default function AnalysisActions({
  appliedApplicationId,
  applying,
  onApply,
  onAnalyzeAnother,
  onViewApplications,
}: AnalysisActionsProps) {
  if (appliedApplicationId) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
        <span className="text-sm text-muted-foreground">
          Saved to your applications.
        </span>
        <button
          type="button"
          onClick={onViewApplications}
          className="rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted min-h-[44px]"
        >
          View applications
        </button>
        <button
          type="button"
          onClick={onAnalyzeAnother}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 min-h-[44px]"
        >
          Analyze another
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
      <button
        type="button"
        onClick={onAnalyzeAnother}
        className="rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted min-h-[44px]"
      >
        Analyze another
      </button>
      <LoadingButton
        type="button"
        isLoading={applying}
        loadingText="Adding…"
        onClick={onApply}
      >
        Add to applications
      </LoadingButton>
    </div>
  );
}
