import { Link } from "react-router-dom";
import SourceBadge from "@/shared/components/ui/SourceBadge";
import {
  formatDesiredDates,
  formatRelativeTime,
} from "@/shared/lib/inquiry-date-format";
import type { InquirySummary } from "@/shared/types/inquiry/inquiry-summary";
import InquiryQualityBadge from "./InquiryQualityBadge";
import InquiryStageBadge from "./InquiryStageBadge";

interface Props {
  inquiry: InquirySummary;
  listingTitle: string | null;
  /**
   * When true (i.e., the inbox is in the "All" filter), render the stage
   * badge alongside the source. When false (inbox is filtered to a specific
   * stage), the stage badge is redundant per RENTALS_PLAN.md §9.1 — it's
   * implied by the active chip.
   */
  showStageBadge: boolean;
}

/**
 * Mobile inquiry card for the inbox. Whole card is tappable per
 * RENTALS_PLAN.md §9.2 (touch target ≥ 44px).
 *
 * Visible data points (per RENTALS_PLAN.md §9.1):
 *   - inquirer name (primary identifier)
 *   - source badge (color + icon)
 *   - desired dates ("Jun 1 → Aug 31" / "Open-ended")
 *   - employer / hospital
 *   - listing requested
 *   - received-at relative time
 *   - quality badge (sparse / none / complete)
 *
 * Excluded per §9.1: stage badge in stage-filtered list (passed via
 * ``showStageBadge``), notes preview, gut_rating at new/triaged stage.
 */

export default function InquiryCard({ inquiry, listingTitle, showStageBadge }: Props) {
  const desiredDates = formatDesiredDates(
    inquiry.desired_start_date,
    inquiry.desired_end_date,
  );
  const inquirerName = inquiry.inquirer_name ?? "Unknown inquirer";
  const employer = inquiry.inquirer_employer ?? "—";
  const listing = listingTitle ?? "—";
  const received = formatRelativeTime(inquiry.received_at);

  return (
    <Link
      to={`/inquiries/${inquiry.id}`}
      data-testid={`inquiry-card-${inquiry.id}`}
      className="block border rounded-lg p-4 min-h-[44px] hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="font-medium leading-tight truncate">{inquirerName}</p>
        <div className="flex items-center gap-1 shrink-0">
          {showStageBadge ? <InquiryStageBadge stage={inquiry.stage} /> : null}
          <SourceBadge source={inquiry.source} variant="short" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{desiredDates}</p>
      <div className="mt-1 flex items-center justify-between text-sm">
        <span className="text-muted-foreground truncate">{employer}</span>
        <InquiryQualityBadge
          signals={{
            desired_start_date: inquiry.desired_start_date,
            desired_end_date: inquiry.desired_end_date,
            inquirer_employer: inquiry.inquirer_employer,
            last_message_body: inquiry.last_message_preview,
          }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="truncate">Listing: {listing}</span>
        <span className="shrink-0 ml-2">{received}</span>
      </div>
    </Link>
  );
}
