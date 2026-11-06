import type { BOARD_STATUS_FILTERS } from "@/games/wow-forever/data/featureRequests/featureRequestBoard";

/** The board's status chip: Open (open + planned + in progress), Shipped, Not planned or All. */
export type BoardStatusFilter = (typeof BOARD_STATUS_FILTERS)[number];
