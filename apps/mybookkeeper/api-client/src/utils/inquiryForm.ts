import { format, isValid, parseISO } from "date-fns";
import { INQUIRY_SOURCE_LABELS } from "../constants/inquiryLabels";
import { INQUIRY_DIRECT_SOURCE, INQUIRY_FORM_PROBLEMS, INQUIRY_RECEIVED_AT_FORMAT } from "../constants/inquiryForm";
import type { InquiryCreateRequest } from "../types/inquiry/inquiry-create-request";
import type { InquiryFormProblems } from "../types/inquiry/inquiry-form-problems";
import type { InquiryFormValues } from "../types/inquiry/inquiry-form-values";
import type { InquirySource } from "../types/inquiry/inquiry-source";

/** A local date-time in the form's "yyyy-MM-ddTHH:mm" shape. */
export function receivedAtValue(date: Date): string {
  return format(date, INQUIRY_RECEIVED_AT_FORMAT);
}

/** What the form opens with: a direct inquiry, received now. */
export function blankInquiryForm(now: Date): InquiryFormValues {
  return {
    source: INQUIRY_DIRECT_SOURCE,
    external_inquiry_id: "",
    listing_id: "",
    inquirer_name: "",
    inquirer_email: "",
    inquirer_phone: "",
    inquirer_employer: "",
    desired_start_date: "",
    desired_end_date: "",
    notes: "",
    received_at: receivedAtValue(now),
  };
}

/** Every source but direct comes from a platform, which gives the inquiry its own ID. */
export function needsExternalInquiryId(source: InquirySource): boolean {
  return source !== INQUIRY_DIRECT_SOURCE;
}

export function externalInquiryIdLabel(source: InquirySource): string {
  return `${INQUIRY_SOURCE_LABELS[source]} inquiry ID`;
}

/** No offset means local time, so this reads it the way the host typed it. */
function parseReceivedAt(value: string): Date | null {
  if (!value.trim()) return null;
  const date = parseISO(value);
  return isValid(date) ? date : null;
}

export function inquiryFormProblems(values: InquiryFormValues): InquiryFormProblems {
  const problems: InquiryFormProblems = {};
  if (needsExternalInquiryId(values.source) && !values.external_inquiry_id.trim()) {
    problems.external_inquiry_id = INQUIRY_FORM_PROBLEMS.externalIdRequired;
  }
  if (!values.inquirer_name.trim()) problems.inquirer_name = INQUIRY_FORM_PROBLEMS.nameRequired;
  const { desired_start_date: start, desired_end_date: end } = values;
  if (start && end && end < start) problems.desired_end_date = INQUIRY_FORM_PROBLEMS.endBeforeStart;
  if (!parseReceivedAt(values.received_at)) problems.received_at = INQUIRY_FORM_PROBLEMS.receivedAtRequired;
  return problems;
}

/**
 * The POST /inquiries body: blanks go as null, and received-at becomes an ISO time with its offset,
 * since the server needs an aware datetime. Only call it once ``inquiryFormProblems`` is empty.
 */
export function inquiryFormToCreateRequest(values: InquiryFormValues): InquiryCreateRequest {
  const receivedAt = parseReceivedAt(values.received_at);
  if (!receivedAt) throw new Error("received_at is not a date-time");
  return {
    source: values.source,
    external_inquiry_id: needsExternalInquiryId(values.source) ? values.external_inquiry_id.trim() || null : null,
    listing_id: values.listing_id || null,
    inquirer_name: values.inquirer_name.trim() || null,
    inquirer_email: values.inquirer_email.trim() || null,
    inquirer_phone: values.inquirer_phone.trim() || null,
    inquirer_employer: values.inquirer_employer.trim() || null,
    desired_start_date: values.desired_start_date || null,
    desired_end_date: values.desired_end_date || null,
    notes: values.notes.trim() || null,
    received_at: receivedAt.toISOString(),
  };
}
