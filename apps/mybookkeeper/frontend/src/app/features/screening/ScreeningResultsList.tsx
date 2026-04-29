import Skeleton from "@/shared/components/ui/Skeleton";
import { useGetScreeningResultsQuery } from "@/shared/store/screeningApi";
import ScreeningResultRow from "./ScreeningResultRow";

interface Props {
  applicantId: string;
}

function ScreeningResultsSkeleton() {
  // Mirror the layout of a real row so there's no layout shift on hydrate.
  return (
    <ul
      data-testid="screening-results-skeleton"
      className="divide-y"
      aria-hidden="true"
    >
      {[0, 1].map((i) => (
        <li key={i} className="flex items-center justify-between py-3 gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Skeleton className="h-5 w-16 rounded" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-4 w-32" />
        </li>
      ))}
    </ul>
  );
}

/**
 * Wrapper for the screening results list — pulls from the dedicated
 * ``GET /applicants/:id/screening`` endpoint (not the parent applicant
 * payload) so the list refreshes independently after an upload.
 *
 * Three states: loading (skeleton), empty (italic helper text), populated
 * (newest-first list). Errors surface as an inline retry per the codebase
 * convention — the parent ApplicantDetail already has a top-level error
 * banner so we keep this list-level error subtle.
 */
export default function ScreeningResultsList({ applicantId }: Props) {
  const { data, isLoading, isError, refetch, isFetching } =
    useGetScreeningResultsQuery(applicantId);

  if (isLoading) {
    return <ScreeningResultsSkeleton />;
  }

  if (isError) {
    return (
      <div className="text-xs text-muted-foreground italic flex items-center gap-3">
        <span>I couldn't load the screening history.</span>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-primary hover:underline min-h-[44px]"
          data-testid="screening-list-retry"
        >
          {isFetching ? "Retrying..." : "Retry"}
        </button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <p
        data-testid="screening-results-empty"
        className="text-xs text-muted-foreground italic"
      >
        No screening reports yet.
      </p>
    );
  }

  return (
    <ul className="divide-y" data-testid="screening-results-list">
      {data.map((result) => (
        <ScreeningResultRow key={result.id} result={result} />
      ))}
    </ul>
  );
}
