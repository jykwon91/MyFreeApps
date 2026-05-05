import { Link } from "react-router-dom";
import {
  formatDesiredDates,
  formatRelativeTime,
} from "@/shared/lib/inquiry-date-format";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";
import ApplicantStageBadge from "./ApplicantStageBadge";

export interface ApplicantCardProps {
  applicant: ApplicantSummary;
  /**
   * When true (i.e., the list is in the "All" filter), render the stage
   * badge alongside the legal name. When false (list is filtered to a
   * specific stage), the stage badge is redundant per RENTALS_PLAN.md §9.1
   * — it's implied by the active chip.
   */
  showStageBadge: boolean;
}

/**
 * Mobile applicant card for the list view. Whole card is tappable per
 * RENTALS_PLAN.md §9.2 (touch target ≥ 44px).
 *
 * Visible data points (per RENTALS_PLAN.md §9.1, list-card subset):
 *   - legal name (primary identifier)
 *   - stage badge (when not stage-filtered)
 *   - employer / hospital
 *   - contract dates
 *   - relative time since promoted (created_at)
 *
 * Excluded per §9.1:
 *   - DOB, vehicle, ID document key (PII — detail page only, behind unlock)
 *   - screening status (detail page only — surfaced via ScreeningResultRow)
 */
export default function ApplicantCard({ applicant, showStageBadge }: ApplicantCardProps) {
  const legalName = applicant.legal_name ?? "Unnamed applicant";
  const employer = applicant.employer_or_hospital ?? "—";
  const contractDates = formatDesiredDates(
    applicant.contract_start,
    applicant.contract_end,
  );
  const created = formatRelativeTime(applicant.created_at);

  return (
    <Link
      to={`/applicants/${applicant.id}`}
      data-testid={`applicant-card-${applicant.id}`}
      className="block border rounded-lg p-4 min-h-[44px] hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-medium leading-tight truncate">{legalName}</p>
        {showStageBadge ? <ApplicantStageBadge stage={applicant.stage} /> : null}
      </div>
      <p className="text-xs text-muted-foreground truncate">{employer}</p>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate">{contractDates}</span>
        <span className="shrink-0 ml-2">{created}</span>
      </div>
    </Link>
  );
}
