import type { ApplicantEventActor } from "../types/applicant/applicant-event-actor";

/** Who made an applicant activity entry, as the host reads it. */
export const APPLICANT_EVENT_ACTOR_LABELS: Record<ApplicantEventActor, string> = {
  host: "You",
  system: "System",
  applicant: "Applicant",
};
