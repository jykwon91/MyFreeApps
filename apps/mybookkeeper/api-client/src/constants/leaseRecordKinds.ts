import type { LeaseAttachmentKind } from "../types/lease/lease-attachment-kind";

/** Mirrors ``LEASE_RECORD_ATTACHMENT_KINDS``: on a locked lease no file can be relabelled into these. */
export const LEASE_RECORD_KINDS: readonly LeaseAttachmentKind[] = ["rendered_original", "signed_lease"];
