import AlertBox from "@/shared/components/ui/AlertBox";
import LoadingButton from "@/shared/components/ui/LoadingButton";
import Skeleton from "@/shared/components/ui/Skeleton";
import { useGetApplicantsQuery } from "@/shared/store/applicantsApi";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";
import type { ApplicantStage } from "@/shared/types/applicant/applicant-stage";

/**
 * Stages where generating a new lease makes sense:
 * - ``approved`` — landlord said yes, lease not yet sent
 * - ``lease_sent`` — lease sent but not yet counter-signed (may need a revision)
 *
 * Excluded stages:
 * - ``lease_signed`` — already has a fully executed lease
 * - ``lead`` / ``screening_*`` / ``video_call_done`` — too early in the funnel
 * - ``declined`` — no longer in consideration
 */
const LEASE_ELIGIBLE_STAGES: ApplicantStage[] = ["approved", "lease_sent"];

interface Props {
  selectedId: string | null;
  onSelect: (applicant: ApplicantSummary) => void;
}

/**
 * Renders a pick-list of applicants eligible for lease generation.
 * Filters to ``approved`` and ``lease_sent`` stages; excludes ``lease_signed``.
 */
export default function ApplicantPicker({ selectedId, onSelect }: Props) {
  const { data, isLoading, isFetching, isError, refetch } =
    useGetApplicantsQuery();
  const allApplicants = data?.items ?? [];
  const eligible = allApplicants.filter((a) =>
    LEASE_ELIGIBLE_STAGES.includes(a.stage),
  );

  if (isError) {
    return (
      <AlertBox variant="error" className="flex items-center justify-between gap-3">
        <span>I couldn't load your applicants. Want me to try again?</span>
        <LoadingButton
          variant="secondary"
          size="sm"
          isLoading={isFetching}
          loadingText="Retrying..."
          onClick={() => refetch()}
        >
          Retry
        </LoadingButton>
      </AlertBox>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2" data-testid="applicant-picker-skeleton">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (eligible.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center" data-testid="applicant-picker-empty">
        No applicants at the right stage yet — move one to{" "}
        <span className="font-medium">Approved</span> or{" "}
        <span className="font-medium">Lease Sent</span> first.
      </p>
    );
  }

  return (
    <ul className="space-y-2" data-testid="applicant-picker-list">
      {eligible.map((a) => (
        <li key={a.id}>
          <button
            type="button"
            onClick={() => onSelect(a)}
            className={[
              "w-full text-left border rounded-lg px-4 py-3 transition-colors min-h-[44px]",
              selectedId === a.id
                ? "border-primary bg-primary/5"
                : "hover:bg-muted/50",
            ].join(" ")}
            data-testid={`applicant-option-${a.id}`}
          >
            <span className="font-medium text-sm">
              {a.legal_name ?? "Unnamed applicant"}
            </span>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
              {a.stage.replace(/_/g, " ")}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}
