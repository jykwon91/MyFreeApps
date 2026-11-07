import type { BisList } from "@/games/wow-forever/types/bisLists/bisList";

/** Every saved list and the one on screen. */
export interface BisListsState {
  lists: readonly BisList[];
  /** Null only when there are no lists. */
  selectedId: string | null;
}
