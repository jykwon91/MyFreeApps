import type { StatKey } from "@/games/wow-forever/data/statKeys";
import type { CompareItem } from "@/games/wow-forever/types/compareItem";
import type { WeightSource } from "@/games/wow-forever/scoring/resolveWeights";

/** A breakdown row is a stat, the weapon's DPS, or the item's armor. */
export type ScoreRowKey = StatKey | "weapon_dps" | "armor";

export interface ScoreRow {
  key: ScoreRowKey;
  label: string;
  /** Amount on the item (percent for *_pct, DPS for weapon_dps). */
  amount: number;
  /** Amount that actually counted (less than `amount` when hit goes past the cap). */
  countedAmount: number;
  /** Null = "not scored": the chosen spec has no weight for this stat. */
  weight: number | null;
  points: number | null;
}

export interface ItemScore {
  total: number;
  rows: ScoreRow[];
  notes: string[];
}

export interface RankedItem {
  item: CompareItem;
  score: ItemScore;
  /** Score as a percentage of the best item's score (100 for the best). */
  pctOfBest: number;
}

/** One line of the side-by-side breakdown: the same row key across every item. */
export interface BreakdownLine {
  key: ScoreRowKey;
  label: string;
  /** Per item, in `ranked` order; null when that item doesn't have the stat. */
  cells: (ScoreRow | null)[];
  scored: boolean;
}

export interface CompareResult {
  /** False until at least two items have something to score. */
  ready: boolean;
  ranked: RankedItem[];
  winner: CompareItem | null;
  isTie: boolean;
  why: string[];
  breakdown: BreakdownLine[];
  warnings: string[];
  notes: string[];
  weightSource: WeightSource;
}
