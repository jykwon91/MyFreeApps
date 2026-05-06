/**
 * MIME types accepted by the lease attachment + receipt re-upload flows.
 * Mirrors the backend allowlist in
 * ``services/leases/signed_lease_service.py::ALLOWED_ATTACHMENT_MIME_TYPES``.
 */
export const LEASE_REUPLOAD_ACCEPT: string = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
].join(",");
