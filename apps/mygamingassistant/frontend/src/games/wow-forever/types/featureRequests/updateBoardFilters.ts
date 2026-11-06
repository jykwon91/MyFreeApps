import type { BoardFilters } from "@/games/wow-forever/types/featureRequests/boardFilters";

/** Change the board's filters in the URL. `replace` stops a highlight from adding a history entry. */
export type UpdateBoardFilters = (patch: Partial<BoardFilters>, options?: { replace: boolean }) => void;
