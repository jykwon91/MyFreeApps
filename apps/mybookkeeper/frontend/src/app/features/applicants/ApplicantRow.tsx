import { useNavigate } from "react-router-dom";
import {
  formatDesiredDates,
  formatRelativeTime,
} from "@/shared/lib/inquiry-date-format";
import type { ApplicantSummary } from "@/shared/types/applicant/applicant-summary";
import ApplicantStageBadge from "./ApplicantStageBadge";

export interface ApplicantRowProps {
  applicant: ApplicantSummary;
}

/**
 * Desktop table row for the Applicants list. Click anywhere navigates to
 * the detail page.
 */
export default function ApplicantRow({ applicant }: ApplicantRowProps) {
  const navigate = useNavigate();
  const legalName = applicant.legal_name ?? "Unnamed applicant";
  const employer = applicant.employer_or_hospital ?? "—";
  const contractDates = formatDesiredDates(
    applicant.contract_start,
    applicant.contract_end,
  );
  const created = formatRelativeTime(applicant.created_at);

  return (
    <tr
      data-testid={`applicant-row-${applicant.id}`}
      onClick={() => navigate(`/applicants/${applicant.id}`)}
      className="border-t cursor-pointer hover:bg-muted/30 transition-colors"
    >
      <td className="px-4 py-3 font-medium">{legalName}</td>
      <td className="px-4 py-3 text-muted-foreground">{employer}</td>
      <td className="px-4 py-3 text-muted-foreground">{contractDates}</td>
      <td className="px-4 py-3 text-muted-foreground">{created}</td>
      <td className="px-4 py-3">
        <ApplicantStageBadge stage={applicant.stage} />
      </td>
    </tr>
  );
}
