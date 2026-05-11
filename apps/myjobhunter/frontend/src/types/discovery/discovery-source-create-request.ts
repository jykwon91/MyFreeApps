/** Body for POST /discover/sources.
 *
 * ``name`` is an optional human-readable label. Required (non-empty) when the
 * operator wants more than one active source of the same kind
 * (e.g. two Greenhouse boards). Defaults to empty string when omitted.
 *
 * ``fetch_interval_minutes`` controls how often the backend scheduler
 * (APScheduler, per PR 5) runs an automatic fetch for this source.
 * Backend validates ``ge=15, le=10080`` (15 minutes through 7 days). The
 * frontend exposes preset values via ``REFRESH_INTERVAL_OPTIONS`` rather
 * than a free-form input so an operator can't accidentally schedule a
 * 1-minute fetch and burn JSearch quota.
 */
export interface DiscoverySourceCreate {
  source: string;
  /** Optional label. Must be distinct across active sources of the same kind. */
  name?: string;
  config: Record<string, unknown>;
  fetch_interval_minutes?: number;
}
