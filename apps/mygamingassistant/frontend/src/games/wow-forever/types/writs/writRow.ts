import type { WritRecord } from "@/games/wow-forever/types/writs/writRecord";
import type { WritTurnInSummary } from "@/games/wow-forever/types/writs/writTurnInSummary";

/** One grid row: a writ with its prices (copper; null = unknown) and where it is handed in. */
export interface WritRow {
  writ: WritRecord;
  writPrice: number | null;
  itemPrice: number | null;
  /** Writ + item, only when both are known — never a partial sum. */
  total: number | null;
  /** Total strictly under the tier's deal threshold. */
  deal: boolean;
  turnIn: WritTurnInSummary | null;
}
