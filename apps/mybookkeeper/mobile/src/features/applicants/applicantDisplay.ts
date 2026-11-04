import { APPLICANT_STAGE_LABELS, APPLICANT_STAGES } from "@mybookkeeper/api-client/constants/applicantLabels";
import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";
import type { ApplicantSummary } from "@mybookkeeper/api-client/types/applicant/applicant-summary";
import type { ScreeningResult } from "@mybookkeeper/api-client/types/applicant/screening-result";
import { formatDesiredDates, formatRelativeTime, formatShortDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";

const SCREENING_PROVIDERS: Record<string, string> = { keycheck: "KeyCheck", rentspree: "RentSpree", other: "Other provider" };
const SCREENING_STATUSES: Record<string, string> = {
  pending: "Waiting for results",
  pass: "Passed",
  fail: "Didn't pass",
  inconclusive: "Inconclusive",
};

export function applicantStageFromParam(param: string | undefined): ApplicantStage | null {
  return APPLICANT_STAGES.find((stage) => stage === param) ?? null;
}

export function applicantName(name: string | null): string {
  return name?.trim() || "Unnamed applicant";
}

export function applicantStageLabel(stage: ApplicantStage): string {
  return APPLICANT_STAGE_LABELS[stage];
}

export function contractDates(start: string | null, end: string | null): string | null {
  return start || end ? formatDesiredDates(start, end) : null;
}

export function promotedAgo(createdAt: string): string {
  return formatRelativeTime(createdAt);
}

export function applicantRowDetails(applicant: ApplicantSummary): string {
  const parts = [applicant.employer_or_hospital?.trim(), contractDates(applicant.contract_start, applicant.contract_end)];
  return parts.filter(Boolean).join(" · ");
}

export function applicantRowLabel(applicant: ApplicantSummary): string {
  const parts = [
    applicantName(applicant.legal_name),
    applicantStageLabel(applicant.stage),
    applicant.employer_or_hospital?.trim(),
    `promoted ${promotedAgo(applicant.created_at)}`,
  ];
  return parts.filter(Boolean).join(", ");
}

export function smokerLabel(smoker: boolean | null): string {
  if (smoker === null) return "Unknown";
  return smoker ? "Yes" : "No";
}

export function screeningLine(result: ScreeningResult): string {
  return `${SCREENING_PROVIDERS[result.provider] ?? result.provider}: ${SCREENING_STATUSES[result.status] ?? result.status}`;
}

export function shortDate(value: string): string {
  return formatShortDate(value);
}
