import { LEASE_TEMPLATE_MIME_TYPES } from "@mybookkeeper/api-client/constants/leaseTemplateUpload";

export const LEASE_TEMPLATE_FORM_MESSAGES = {
  name: "Template name",
  namePlaceholder: "Default lease bundle",
  description: "Description",
  descriptionHint: "Optional. For example: used for short-term furnished rentals.",
  files: "Files",
  filesHint: "Word (.docx), Markdown (.md) or text (.txt). I'll find bracketed placeholders like [TENANT FULL NAME].",
  noFilesYet: "No files chosen yet.",
  addFile: "Add a file",
  addAnotherFile: "Add another file",
  upload: "Upload template",
  uploading: "Uploading…",
  reading: "Reading it through to find the placeholders…",
  stillUploading: "Still uploading. Hang on a moment.",
} as const;

/**
 * What the file picker offers: the three types the server takes, plus the two an Android picker may report for a
 * Markdown file (it has no standard type). The extension is checked after picking, so a stray file can't get through.
 */
export const LEASE_TEMPLATE_PICKER_TYPES: readonly string[] = [...LEASE_TEMPLATE_MIME_TYPES, "text/x-markdown", "application/octet-stream"];

export const LEASE_TEMPLATE_DESCRIPTION_MIN_HEIGHT = 96;

export function templateCreated(name: string): string {
  return `${name} created.`;
}
