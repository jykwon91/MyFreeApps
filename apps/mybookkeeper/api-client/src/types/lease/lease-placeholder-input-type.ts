/**
 * Allowed input types for a lease-template placeholder.
 *
 * Mirrors backend tuple ``LEASE_PLACEHOLDER_INPUT_TYPES`` in
 * ``app/core/lease_enums.py`` — keep both in sync.
 */
export type LeasePlaceholderInputType =
  | "text"
  | "email"
  | "phone"
  | "date"
  | "number"
  | "computed"
  | "signature";
