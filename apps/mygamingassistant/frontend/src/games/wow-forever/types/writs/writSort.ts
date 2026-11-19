import type { WritSortDirection } from "@/games/wow-forever/types/writs/writSortDirection";
import type { WritSortKey } from "@/games/wow-forever/types/writs/writSortKey";

export interface WritSort {
  key: WritSortKey;
  direction: WritSortDirection;
}
