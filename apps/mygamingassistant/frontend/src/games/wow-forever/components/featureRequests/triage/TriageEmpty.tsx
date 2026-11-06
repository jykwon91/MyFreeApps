import { Link } from "react-router-dom";
import { LoadingButton } from "@platform/ui";
import { TRIAGE_COPY } from "@/games/wow-forever/data/featureRequests/triage/triageCopy";
import { TRIAGE_SECONDARY_BUTTON } from "@/games/wow-forever/data/featureRequests/triage/triageStyles";

type TriageEmptyProps =
  | { variant: "inbox"; seeAllHref: string; checkedLabel: string; refreshing: boolean; onRefresh: () => void }
  | { variant: "filtered"; onClearFilters: () => void };

/** "All caught up." (inbox) or "Nothing here." (All requests filters). */
export default function TriageEmpty(props: TriageEmptyProps) {
  if (props.variant === "filtered") {
    return (
      <div className="space-y-3 rounded-xl border bg-card p-6 text-center" data-testid="triage-empty-filtered">
        <p className="font-medium">{TRIAGE_COPY.nothingHere}</p>
        <button type="button" onClick={props.onClearFilters} className={TRIAGE_SECONDARY_BUTTON}>
          {TRIAGE_COPY.clearFilters}
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-xl border bg-card p-6 text-center" data-testid="triage-empty-inbox">
      <p className="text-lg font-semibold">{TRIAGE_COPY.allCaughtUp}</p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Link to={props.seeAllHref} className={TRIAGE_SECONDARY_BUTTON}>
          {TRIAGE_COPY.seeAllRequests}
        </Link>
        <LoadingButton variant="secondary" isLoading={props.refreshing} loadingText={TRIAGE_COPY.refresh} onClick={props.onRefresh}>
          {TRIAGE_COPY.refresh}
        </LoadingButton>
      </div>
      <p className="text-xs text-muted-foreground">{props.checkedLabel}</p>
    </div>
  );
}
