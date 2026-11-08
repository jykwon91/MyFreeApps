import type { AskNpcRow } from "@/games/wow-forever/types/ask/askNpcRow";

/** What an Ask card's mini map needs from a row: NPC results, rares and gold farm spots alike. */
export type AskMapRow = Pick<AskNpcRow, "poiId" | "n" | "name" | "x" | "y">;
