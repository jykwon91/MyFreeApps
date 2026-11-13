import type { DiscoverView } from "./discover-view";
import type { DiscoveredJob } from "./discovered-job";

export interface DiscoveredJobListResponse {
  items: DiscoveredJob[];
  /** Full matching-row count for the (state, source_id) filter — NOT the
   * returned page length. Drives ``has_more`` and the inbox load-more. */
  total: number;
  /** ``offset + items.length < total`` — true when more rows exist beyond the
   * current page. The inbox grows ``limit`` in place until this is false. */
  has_more: boolean;
  /** The view listed; "all" is every row, expired and closed ones too. */
  state: DiscoverView | "all";
  /**
   * Inbox scoring coverage across the WHOLE active inbox (not just the
   * returned page): ``scored_count`` of ``total_count`` rows carry an AI
   * score. Null on every other view, where the coverage
   * framing doesn't apply.
   */
  scored_count: number | null;
  total_count: number | null;
}
