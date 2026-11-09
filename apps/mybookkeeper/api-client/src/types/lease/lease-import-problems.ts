export interface LeaseImportProblems {
  applicantId?: "applicant_required";
  endsOn?: "ends_before_starts";
  notes?: "notes_too_long";
  files?: "files_required";
}
