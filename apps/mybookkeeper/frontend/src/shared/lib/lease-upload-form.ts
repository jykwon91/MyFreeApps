import type { LeaseAttachmentKind } from "@mybookkeeper/api-client/types/lease/lease-attachment-kind";
import type { SignedLeaseImportRequest } from "@/shared/types/lease/signed-lease-import-request";

export function leaseAttachmentForm(file: File, kind: LeaseAttachmentKind): FormData {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", kind);
  return form;
}

export function leaseImportForm(request: SignedLeaseImportRequest): FormData {
  const form = new FormData();
  form.append("applicant_id", request.applicant_id);
  if (request.listing_id) form.append("listing_id", request.listing_id);
  if (request.starts_on) form.append("starts_on", request.starts_on);
  if (request.ends_on) form.append("ends_on", request.ends_on);
  if (request.notes) form.append("notes", request.notes);
  if (request.status) form.append("status", request.status);
  if (request.parent_lease_id) form.append("parent_lease_id", request.parent_lease_id);
  for (const file of request.files) form.append("files", file);
  return form;
}
