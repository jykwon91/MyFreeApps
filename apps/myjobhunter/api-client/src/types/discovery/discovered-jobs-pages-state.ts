import type { InfinitePagesResult } from "@platform/core/types/paging/infinite-pages-result";
import type { DiscoveredJob } from "./discovered-job";

/** A paged list of discovered postings, plus the inbox's scoring coverage from its first page. */
export interface DiscoveredJobsPagesState extends Omit<InfinitePagesResult<DiscoveredJob>, "items"> {
  jobs: DiscoveredJob[];
  /** Null outside the inbox, or before anything loads. */
  scoredCount: number | null;
  totalCount: number | null;
}
