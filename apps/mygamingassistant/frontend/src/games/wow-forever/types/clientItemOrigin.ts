import type { ItemNumbers } from "@/games/wow-forever/types/itemNumbers";

/** Which game-file item a compare item was picked from, and its numbers as picked. */
export interface ClientItemOrigin {
  itemId: number;
  clientBuild: string;
  baseline: ItemNumbers;
}
