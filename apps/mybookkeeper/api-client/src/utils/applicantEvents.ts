import { APPLICANT_STAGE_LABELS } from "../constants/applicantLabels";
import type { ApplicantStage } from "../types/applicant/applicant-stage";

const NON_STAGE_EVENT_LABELS: Record<string, string> = {
  note_added: "Note added",
  screening_initiated: "Screening initiated",
  screening_completed: "Screening completed",
  reference_contacted: "Reference contacted",
  stage_changed: "Stage changed",
  contract_dates_changed: "Contract dates changed",
  tenancy_ended: "Tenancy ended",
  tenancy_restarted: "Tenancy restarted",
  tenancy_extended: "Lease extended",
  extension_undone: "Extension undone",
  contact_email_changed: "Contact email updated",
};

export function applicantEventLabel(eventType: string): string {
  if (eventType in APPLICANT_STAGE_LABELS) {
    return `Moved to ${APPLICANT_STAGE_LABELS[eventType as ApplicantStage]}`;
  }
  if (eventType in NON_STAGE_EVENT_LABELS) {
    return NON_STAGE_EVENT_LABELS[eventType];
  }
  return eventType.charAt(0).toUpperCase() + eventType.slice(1);
}
