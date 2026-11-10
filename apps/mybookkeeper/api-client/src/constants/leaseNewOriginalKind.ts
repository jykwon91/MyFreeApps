import type { LeaseAttachmentKind } from "../types/lease/lease-attachment-kind";

/** The kind a locked lease refuses to take: no more originals once the lease is sent, emailed or signed. */
export const LEASE_NEW_ORIGINAL_KIND: LeaseAttachmentKind = "rendered_original";
