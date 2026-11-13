import { DISCOVER_EMPTY_STATES } from "@/constants/empty-states";
import { DISCOVERED_JOBS_LIST_MESSAGES } from "@/constants/discovered-jobs-list-messages";
import { DISMISSED_JOBS_LIST_MESSAGES } from "@/constants/dismissed-jobs-list-messages";
import type { DiscoverListViewKind } from "@/types/discover-list-view-kind";

/** What the Saved and Dismissed tabs say: their list footer and errors, and their empty states with and without a saved-search filter. */
export const DISCOVER_LIST_VIEW_COPY = {
  saved: {
    messages: DISCOVERED_JOBS_LIST_MESSAGES,
    empty: DISCOVER_EMPTY_STATES.saved_empty,
    emptyFiltered: DISCOVER_EMPTY_STATES.saved_empty_filtered,
  },
  dismissed: {
    messages: DISMISSED_JOBS_LIST_MESSAGES,
    empty: DISCOVER_EMPTY_STATES.dismissed_empty,
    emptyFiltered: DISCOVER_EMPTY_STATES.dismissed_empty_filtered,
  },
} as const satisfies Record<DiscoverListViewKind, unknown>;
