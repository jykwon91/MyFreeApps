import { INQUIRY_SOURCE_SHORT_LABELS, INQUIRY_STAGE_LABELS } from "@mybookkeeper/api-client/constants/inquiryLabels";
import type { InquiryEvent } from "@mybookkeeper/api-client/types/inquiry/inquiry-event";
import type { InquiryMessage } from "@mybookkeeper/api-client/types/inquiry/inquiry-message";
import type { InquirySpamAssessment } from "@mybookkeeper/api-client/types/inquiry/inquiry-spam-assessment";
import type { InquirySpamAssessmentType } from "@mybookkeeper/api-client/types/inquiry/inquiry-spam-assessment-type";
import type { InquiryStage } from "@mybookkeeper/api-client/types/inquiry/inquiry-stage";
import type { InquirySummary } from "@mybookkeeper/api-client/types/inquiry/inquiry-summary";
import { formatDesiredDates, formatRelativeTime, formatShortDate } from "@mybookkeeper/api-client/utils/inquiryDateFormat";
import {
  BODY_LENGTH_THRESHOLD,
  computeInquiryQualityScore,
  getQualityTier,
} from "@mybookkeeper/api-client/utils/inquiryQuality";

const SPAM_CHECK_LABELS: Record<InquirySpamAssessmentType, string> = {
  turnstile: "Bot check",
  honeypot: "Hidden form field",
  submit_timing: "Time taken to fill in the form",
  disposable_email: "Throwaway email address",
  rate_limit: "Too many messages",
  claude_score: "How it reads",
  manual_override: "Your decision",
};

export function inquirerName(name: string | null): string {
  return name?.trim() || "Unknown inquirer";
}

export function stageLabel(stage: InquiryStage): string {
  return INQUIRY_STAGE_LABELS[stage];
}

export function stayDates(start: string | null, end: string | null): string {
  return start || end ? formatDesiredDates(start, end) : "Dates not given";
}

function spokenStayDates(start: string | null, end: string | null): string {
  if (start && end) return `${formatShortDate(start)} to ${formatShortDate(end)}`;
  return stayDates(start, end);
}

export function rowDetails(inquiry: InquirySummary): string {
  return [stayDates(inquiry.desired_start_date, inquiry.desired_end_date), inquiry.inquirer_employer?.trim()]
    .filter(Boolean)
    .join(" · ");
}

/** Sparse or Complete. An ordinary inquiry says nothing. */
export function qualityLabel(inquiry: InquirySummary): string | null {
  const tier = getQualityTier(
    computeInquiryQualityScore({
      desired_start_date: inquiry.desired_start_date,
      desired_end_date: inquiry.desired_end_date,
      inquirer_employer: inquiry.inquirer_employer,
      last_message_body: inquiry.last_message_preview,
    }),
  );
  if (tier === "sparse") return "Sparse";
  return tier === "complete" ? "Complete" : null;
}

export function spamLabel(status: InquirySummary["spam_status"]): string | null {
  if (status === "flagged") return "Flagged";
  return status === "spam" ? "Spam" : null;
}

export function shortSource(inquiry: InquirySummary): string {
  return INQUIRY_SOURCE_SHORT_LABELS[inquiry.source];
}

export function receivedAgo(receivedAt: string): string {
  return formatRelativeTime(receivedAt);
}

export function rowAccessibilityLabel(inquiry: InquirySummary): string {
  return [
    inquirerName(inquiry.inquirer_name),
    stageLabel(inquiry.stage).toLowerCase(),
    spamLabel(inquiry.spam_status)?.toLowerCase(),
    spokenStayDates(inquiry.desired_start_date, inquiry.desired_end_date),
    inquiry.inquirer_employer?.trim(),
    `received ${receivedAgo(inquiry.received_at)}`,
  ]
    .filter(Boolean)
    .join(", ");
}

export function messageBody(message: InquiryMessage): string {
  return message.parsed_body?.trim() || message.raw_email_body?.trim() || "This message has no text.";
}

function messageTime(message: InquiryMessage): string {
  return message.sent_at ?? message.created_at;
}

export function messageWhen(message: InquiryMessage): string {
  return formatRelativeTime(messageTime(message));
}

/** The newest message from them comes first, since that's what you're answering. */
export function arrangeMessages(messages: InquiryMessage[]): { first: InquiryMessage | null; earlier: InquiryMessage[] } {
  const newestFirst = [...messages].sort((a, b) => messageTime(b).localeCompare(messageTime(a)));
  const first = newestFirst.find((message) => message.direction === "inbound") ?? newestFirst[0] ?? null;
  return { first, earlier: newestFirst.filter((message) => message !== first) };
}

export function messageSpeaker(message: InquiryMessage, name: string | null): string {
  return message.direction === "outbound" ? "Your reply" : `From ${inquirerName(name)}`;
}

export function spokenMessage(message: InquiryMessage, name: string | null): string {
  const speaker = message.direction === "outbound" ? "Your reply" : `Message from ${inquirerName(name)}`;
  return `${speaker}, ${messageWhen(message)}: ${messageBody(message)}`;
}

export function eventLabel(event: InquiryEvent): string {
  if (event.event_type === "received") return "Received";
  const stage = event.event_type as InquiryStage;
  if (stage in INQUIRY_STAGE_LABELS) return `Moved to ${INQUIRY_STAGE_LABELS[stage]}`;
  return event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1);
}

export function spamCheckLabel(check: InquirySpamAssessment): string {
  return SPAM_CHECK_LABELS[check.assessment_type];
}

export function spamCheckResult(check: InquirySpamAssessment): string {
  if (check.assessment_type === "manual_override") return check.passed ? "Not spam" : "Spam";
  const result = check.passed === null ? "Not checked" : check.passed ? "Passed" : "Didn't pass";
  return check.score === null ? result : `${result} (${check.score})`;
}

export function qualityFactors(signals: {
  desired_start_date: string | null;
  desired_end_date: string | null;
  inquirer_employer: string | null;
  last_message_body: string | null;
}): { label: string; met: boolean }[] {
  const hasEmployer = Boolean(signals.inquirer_employer?.trim());
  const isDetailed = (signals.last_message_body?.trim().length ?? 0) > BODY_LENGTH_THRESHOLD;
  return [
    { label: signals.desired_start_date ? "Start date given" : "No start date", met: Boolean(signals.desired_start_date) },
    { label: signals.desired_end_date ? "End date given" : "No end date", met: Boolean(signals.desired_end_date) },
    { label: hasEmployer ? "Employer given" : "No employer", met: hasEmployer },
    { label: isDetailed ? "Detailed message" : "Short message", met: isDetailed },
  ];
}
