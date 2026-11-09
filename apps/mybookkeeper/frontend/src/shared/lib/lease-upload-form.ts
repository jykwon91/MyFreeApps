import type { LeaseAttachmentKind } from "@mybookkeeper/api-client/types/lease/lease-attachment-kind";
import type { LeaseImportFormValues } from "@mybookkeeper/api-client/types/lease/lease-import-form-values";
import { leaseImportFields } from "@mybookkeeper/api-client/utils/leaseImportForm";

export function leaseAttachmentForm(file: File, kind: LeaseAttachmentKind): FormData {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  return form;
}

export function leaseImportForm(values: LeaseImportFormValues, files: readonly File[]): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(leaseImportFields(values))) form.append(name, value);
  for (const file of files) form.append("files", file);
  return form;
}
