import type { LeasePlaceholderInputType } from "@mybookkeeper/api-client/types/lease/lease-placeholder-input-type";
import type { SignedLeaseStatus } from "@mybookkeeper/api-client/types/lease/signed-lease-status";
import type { BadgeColor } from "@/shared/components/ui/Badge";

/**
 * Display tables for the Leases domain.
 *
 * Mirrors backend tuples in ``app/core/lease_enums.py`` — keep both in sync
 * when statuses / kinds / input types are added.
 */

export const SIGNED_LEASE_STATUS_BADGE_COLORS: Record<SignedLeaseStatus, BadgeColor> = {
  draft: "gray",
  generated: "blue",
  sent: "blue",
  signed: "green",
  active: "green",
  ended: "gray",
  terminated: "red",
};

export const LEASE_PLACEHOLDER_INPUT_TYPE_LABELS: Record<
  LeasePlaceholderInputType,
  string
> = {
  text: "Text",
  email: "Email",
  phone: "Phone",
  date: "Date",
  number: "Number",
  computed: "Computed",
  signature: "Signature",
};

/**
 * Human-friendly labels for the ``provenance`` field on
 * ``SignedLeaseTemplatePrefillItem``. Mirrors the backend
 * ``ProvenanceLabel`` type in ``default_source_resolver.py``. Unknown
 * values fall through to ``null`` and no chip is rendered.
 */
export const PREFILL_PROVENANCE_LABELS: Record<string, string> = {
  applicant: "from applicant",
  inquiry: "from inquiry",
  lease: "from lease",
  property: "from property",
  user: "from your profile",
  today: "today's date",
};

export const LEASE_PLACEHOLDER_INPUT_TYPES: readonly LeasePlaceholderInputType[] = [
  "text",
  "email",
  "phone",
  "date",
  "number",
  "computed",
  "signature",
] as const;
