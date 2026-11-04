import type { ReferenceContact } from "./reference-contact";
import type { ScreeningReport } from "./screening-report";

/** What ``POST /applicants/{id}/sensitive`` returns. Each request is recorded. */
export interface ApplicantSensitive {
  dob: string | null;
  vehicle_make_model: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  references: ReferenceContact[];
  screening_reports: ScreeningReport[];
}
