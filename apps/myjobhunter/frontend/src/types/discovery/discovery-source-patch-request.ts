/**
 * Body for ``PATCH /discover/sources/{id}``.
 *
 * All fields optional; at least one required.
 *
 * When ``config`` is provided, ``source_kind`` must also be included so
 * the backend can dispatch per-source config validation (mirrors the same
 * validation that runs at creation time).  ``config`` replaces the entire
 * JSONB blob — the dialog pre-fills all fields from the existing row and
 * sends a full replacement.
 */
export interface DiscoverySourcePatchRequest {
  fetch_interval_minutes?: number;
  name?: string;
  is_active?: boolean;
  /** Full replacement config. Requires source_kind to be set. */
  config?: Record<string, unknown>;
  /** Source kind of the row (e.g. "jsearch", "greenhouse", "lever").
   *  Required when config is provided. */
  source_kind?: string;
}
