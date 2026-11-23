import { DISCOVERED_JOBS_LIST_MESSAGES } from "@/constants/discovered-jobs-list-messages";
import { DISMISSED_JOBS_LIST_MESSAGES } from "@/constants/dismissed-jobs-list-messages";
import type { DiscoverListViewKind } from "@/types/discover-list-view-kind";

/** What the Saved and Dismissed tabs say in their list footer and errors. */
export const DISCOVER_LIST_VIEW_MESSAGES = {
  saved: DISCOVERED_JOBS_LIST_MESSAGES,
  dismissed: DISMISSED_JOBS_LIST_MESSAGES,
} as const satisfies Record<DiscoverListViewKind, unknown>;
