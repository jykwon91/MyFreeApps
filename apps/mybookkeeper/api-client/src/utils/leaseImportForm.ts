import { LEASE_NOTES_MAX_LENGTH } from "../constants/leaseLabels";
import type { LeaseImportFormValues } from "../types/lease/lease-import-form-values";
import type { LeaseImportProblems } from "../types/lease/lease-import-problems";

export const EMPTY_LEASE_IMPORT_FORM: LeaseImportFormValues = { applicantId: "", listingId: "", startsOn: "", endsOn: "", notes: "" };

/** What the server would refuse, found before the files are sent: they can be large. */
export function leaseImportProblems(values: LeaseImportFormValues, fileCount: number): LeaseImportProblems {
  const problems: LeaseImportProblems = {};
  if (values.applicantId === "") problems.applicantId = "applicant_required";
  if (fileCount === 0) problems.files = "files_required";
  if (values.startsOn !== "" && values.endsOn !== "" && values.endsOn < values.startsOn) problems.endsOn = "ends_before_starts";
  if (values.notes.length > LEASE_NOTES_MAX_LENGTH) problems.notes = "notes_too_long";
  return problems;
}

/** The text fields of the import request, with what wasn't given left out. */
export function leaseImportFields(values: LeaseImportFormValues): Record<string, string> {
  const fields: Record<string, string> = { applicant_id: values.applicantId, status: "signed" };
  if (values.listingId) fields.listing_id = values.listingId;
  if (values.startsOn) fields.starts_on = values.startsOn;
  if (values.endsOn) fields.ends_on = values.endsOn;
  if (values.notes.trim()) fields.notes = values.notes.trim();
  return fields;
}
