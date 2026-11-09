/** What is missing from a new template, to say beside its field. */
export interface LeaseTemplateUploadProblems {
  name?: "name_required" | "name_too_long";
  files?: "files_required" | "file_type_unsupported" | "file_too_big" | "files_too_big_together";
}
