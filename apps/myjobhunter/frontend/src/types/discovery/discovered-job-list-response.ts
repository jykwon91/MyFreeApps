import type { DiscoveredJob } from "./discovered-job";

export interface DiscoveredJobListResponse {
  items: DiscoveredJob[];
  total: number;
  state: "inbox" | "saved" | "all";
  /**
   * Inbox scoring coverage across the WHOLE active inbox (not just the
   * returned page): ``scored_count`` of ``total_count`` rows carry an AI
   * score. Null on the ``saved`` / ``all`` views, where the coverage
   * framing doesn't apply.
   */
  scored_count: number | null;
  total_count: number | null;
}
