import { RowPrimaryAction } from "@platform/ui";
import { useNavigate } from "react-router-dom";
import SourceBadge from "@/shared/components/ui/SourceBadge";
import {
  formatDesiredDates,
  formatRelativeTime,
} from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import type { InquirySummary } from "@mybookkeeper/api-client/types/inquiry/inquiry-summary";
import InquiryQualityBadge from "./InquiryQualityBadge";
import InquirySpamBadge from "./InquirySpamBadge";
import InquiryStageBadge from "./InquiryStageBadge";

export interface InquiryRowProps {
  inquiry: InquirySummary;
  listingTitle: string | null;
}

/**
 * Desktop table row for an inquiry. A click anywhere on the row opens the
 * inquiry; the inquirer's name is the link keyboard and screen-reader users
 * reach, same pattern as ``ListingTableRow``.
 *
 * Columns: Inquirer | Source | Desired Dates | Employer | Listing | Received | Stage | Quality.
 */
export default function InquiryRow({ inquiry, listingTitle }: InquiryRowProps) {
  const navigate = useNavigate();
  const detailPath = `/inquiries/${inquiry.id}`;

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
      onClick={() => navigate(detailPath)}
      data-testid={`inquiry-row-${inquiry.id}`}
      className="border-t cursor-pointer hover:bg-muted/40"
    >
      <td className="px-4 py-3 font-medium">
        <div className="flex items-center gap-2">
          <RowPrimaryAction to={detailPath}>{inquirerName}</RowPrimaryAction>
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
