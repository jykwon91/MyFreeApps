import { APPLICANT_EVENT_ACTOR_LABELS } from "@mybookkeeper/api-client/constants/applicantEventActorLabels";
import { APPLICANT_STAGE_LABELS, APPLICANT_STAGES } from "@mybookkeeper/api-client/constants/applicantLabels";
import type { ApplicantEvent } from "@mybookkeeper/api-client/types/applicant/applicant-event";
import type { ApplicantReference } from "@mybookkeeper/api-client/types/applicant/applicant-reference";
import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";
import type { ApplicantSummary } from "@mybookkeeper/api-client/types/applicant/applicant-summary";
import type { ScreeningResult } from "@mybookkeeper/api-client/types/applicant/screening-result";
import type { VideoCallNote } from "@mybookkeeper/api-client/types/applicant/video-call-note";
import { referenceRelationshipLabel } from "@mybookkeeper/api-client/utils/applicantReferenceLabel";
import { formatDesiredDates, formatRelativeTime, formatShortDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";

const MAX_GUT_RATING = 5;
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

export function screeningOutcomeLabel(status: string): string {
  return SCREENING_STATUSES[status] ?? status;
}

export function screeningLine(result: ScreeningResult): string {
  return `${SCREENING_PROVIDERS[result.provider] ?? result.provider}: ${SCREENING_STATUSES[result.status] ?? result.status}`;
}

export function shortDate(value: string): string {
  return formatShortDate(value);
}

export function referenceLines(reference: ApplicantReference): string[] {
  const contacted = reference.contacted_at ? `Contacted ${formatRelativeTime(reference.contacted_at)}` : "Not contacted yet";
  return [`${referenceRelationshipLabel(reference.relationship)} · ${contacted}`, reference.notes?.trim() ?? ""].filter(Boolean);
}

export function eventLines(event: ApplicantEvent): string[] {
  return [`By ${APPLICANT_EVENT_ACTOR_LABELS[event.actor]}`, event.notes?.trim() ?? ""].filter(Boolean);
}

export function ratingLabel(rating: number | null): string | null {
  return rating === null ? null : `Rating ${rating} of ${MAX_GUT_RATING}`;
}

export function videoCallLines(call: VideoCallNote): string[] {
  return [
    `Scheduled ${formatRelativeTime(call.scheduled_at)}`,
    call.completed_at ? `Completed ${formatRelativeTime(call.completed_at)}` : "",
    ratingLabel(call.gut_rating) ?? "",
    call.notes?.trim() || "No notes",
  ].filter(Boolean);
}

export function screeningUploadedLine(result: ScreeningResult): string {
  return `Uploaded ${formatRelativeTime(result.uploaded_at)}`;
}
