/**
 * The public board's fixed values (`/wow-forever/suggest`, `components/featureRequests/FeatureRequestBoard.tsx`).
 */
import type { BoardStatusFilter } from "@/games/wow-forever/types/featureRequests/boardStatusFilter";
import type { FeatureSort } from "@/games/wow-forever/types/featureRequests/featureSort";
import type { PublicStoryStatus } from "@/games/wow-forever/types/featureRequests/publicStoryStatus";

export const SUGGEST_PAGE_PATH = "/wow-forever/suggest";

/** The status chips, in the order they show. */
export const BOARD_STATUS_FILTERS = ["open", "shipped", "not_planned", "all"] as const;

export const DEFAULT_BOARD_STATUS: BoardStatusFilter = "open";
export const DEFAULT_BOARD_SORT: FeatureSort = "top";

/** Which story statuses each chip asks the API for. Empty = every public status. */
export const BOARD_STATUSES_BY_FILTER: Readonly<Record<BoardStatusFilter, readonly PublicStoryStatus[]>> = {
  open: ["open", "planned", "in_progress"],
  shipped: ["shipped"],
  not_planned: ["not_planned"],
  all: [],
};

export const BOARD_STATUS_FILTER_LABEL: Readonly<Record<BoardStatusFilter, string>> = {
  open: "Open",
  shipped: "Shipped",
  not_planned: "Not planned",
  all: "All",
};

export const BOARD_STATUS_OPTIONS: readonly { id: BoardStatusFilter; label: string }[] = BOARD_STATUS_FILTERS.map(
  (id) => ({ id, label: BOARD_STATUS_FILTER_LABEL[id] }),
);

export const BOARD_SORT_OPTIONS: readonly { id: FeatureSort; label: string }[] = [
  { id: "top", label: "Most asked" },
  { id: "new", label: "Newest" },
];

/** Stories per "Show more". */
export const BOARD_PAGE_SIZE = 20;

/** The skeleton's card count while the board first loads. */
export const BOARD_SKELETON_CARDS = 4;

/** URL query keys. */
export const BOARD_PARAM = { status: "status", area: "area", sort: "sort", highlight: "r" } as const;

/** The board section's element id — `?r=` scrolls to a card inside it. */
export const BOARD_SECTION_ID = "feature-request-board";
