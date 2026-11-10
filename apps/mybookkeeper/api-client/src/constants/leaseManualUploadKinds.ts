import { LEASE_ATTACHMENT_KINDS, type LeaseAttachmentKind } from "../types/lease/lease-attachment-kind";
import { LEASE_NEW_ORIGINAL_KIND } from "./leaseNewOriginalKind";

/** What a person can file by hand: originals come only from rendering the lease. */
export const LEASE_MANUAL_UPLOAD_KINDS: readonly LeaseAttachmentKind[] = LEASE_ATTACHMENT_KINDS.filter(
  (kind) => kind !== LEASE_NEW_ORIGINAL_KIND,
);
