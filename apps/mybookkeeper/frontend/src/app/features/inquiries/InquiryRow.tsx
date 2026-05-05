import { useNavigate } from "react-router-dom";
import SourceBadge from "@/shared/components/ui/SourceBadge";
import {
  formatDesiredDates,
  formatRelativeTime,
} from "@/shared/lib/inquiry-date-format";
import type { InquirySummary } from "@/shared/types/inquiry/inquiry-summary";
import InquiryQualityBadge from "./InquiryQualityBadge";
import InquirySpamBadge from "./InquirySpamBadge";
import InquiryStageBadge from "./InquiryStageBadge";

export interface InquiryRowProps {
  inquiry: InquirySummary;
  listingTitle: string | null;
}

/**
 * Desktop table row for an inquiry. The whole row is clickable
 * (programmatic navigation) and exposes a keyboard-accessible button via
 * ``tabIndex`` + Enter/Space handlers — same pattern as ``ListingTableRow``.
 *
 * Columns: Inquirer | Source | Desired Dates | Employer | Listing | Received | Stage | Quality.
 */
export default function InquiryRow({ inquiry, listingTitle }: InquiryRowProps) {
  const navigate = useNavigate();
  const goToDetail = () => navigate(`/inquiries/${inquiry.id}`);

  const desiredDates = formatDesiredDates(
    inquiry.desired_start_date,
    inquiry.desired_end_date,
  );
  const inquirerName = inquiry.inquirer_name ?? "Unknown inquirer";
  const employer = inquiry.inquirer_employer ?? "—";
  const listing = listingTitle ?? "—";
  const received = formatRelativeTime(inquiry.received_at);

  return (
    <tr
      role="link"
      tabIndex={0}
      data-testid={`inquiry-row-${inquiry.id}`}
      onClick={goToDetail}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToDetail();
        }
      }}
      className="border-t cursor-pointer hover:bg-muted/40 focus:outline-none focus:ring-2 focus:ring-primary"
    >
      <td className="px-4 py-3 font-medium">
        <div className="flex items-center gap-2">
          <span>{inquirerName}</span>
          <InquirySpamBadge status={inquiry.spam_status} score={inquiry.spam_score} />
        </div>
      </td>
      <td className="px-4 py-3"><SourceBadge source={inquiry.source} variant="short" /></td>
      <td className="px-4 py-3 text-muted-foreground">{desiredDates}</td>
      <td className="px-4 py-3 text-muted-foreground">{employer}</td>
      <td className="px-4 py-3 text-muted-foreground truncate max-w-[180px]">{listing}</td>
      <td className="px-4 py-3 text-muted-foreground text-xs">{received}</td>
      <td className="px-4 py-3"><InquiryStageBadge stage={inquiry.stage} /></td>
      <td className="px-4 py-3">
        <InquiryQualityBadge
          signals={{
            desired_start_date: inquiry.desired_start_date,
            desired_end_date: inquiry.desired_end_date,
            inquirer_employer: inquiry.inquirer_employer,
            last_message_body: inquiry.last_message_preview,
          }}
        />
      </td>
    </tr>
  );
}
