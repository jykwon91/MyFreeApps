import {
  LEASE_TEMPLATE_EXTENSIONS,
  LEASE_TEMPLATE_FILE_MAX_BYTES,
  LEASE_TEMPLATE_FILES_TOTAL_MAX_BYTES,
  LEASE_TEMPLATE_NAME_MAX_LENGTH,
} from "../constants/leaseTemplateUpload";
import type { LeaseTemplateUploadFile } from "../types/lease/lease-template-upload-file";
import type { LeaseTemplateUploadProblems } from "../types/lease/lease-template-upload-problems";

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return LEASE_TEMPLATE_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function filesProblem(files: readonly LeaseTemplateUploadFile[]): LeaseTemplateUploadProblems["files"] {
  if (files.length === 0) return "files_required";
  if (files.some((file) => !hasAllowedExtension(file.name))) return "file_type_unsupported";
  const sizes = files.map((file) => file.size ?? 0);
  if (sizes.some((size) => size > LEASE_TEMPLATE_FILE_MAX_BYTES)) return "file_too_big";
  if (sizes.reduce((sum, size) => sum + size, 0) > LEASE_TEMPLATE_FILES_TOTAL_MAX_BYTES) return "files_too_big_together";
  return undefined;
}

/** What stops a new template from being sent yet. Empty when it can go. A file whose size isn't known is let through to the server. */
export function leaseTemplateUploadProblems(name: string, files: readonly LeaseTemplateUploadFile[]): LeaseTemplateUploadProblems {
  const problems: LeaseTemplateUploadProblems = {};
  const trimmed = name.trim();
  if (trimmed === "") problems.name = "name_required";
  else if (trimmed.length > LEASE_TEMPLATE_NAME_MAX_LENGTH) problems.name = "name_too_long";
  const filesIssue = filesProblem(files);
  if (filesIssue) problems.files = filesIssue;
  return problems;
}
