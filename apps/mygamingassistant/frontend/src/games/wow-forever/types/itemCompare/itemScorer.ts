import type { ClientItem } from "@/games/wow-forever/types/clientItem";

/** An item's weighted score for one class/spec/level (higher is better). */
export type ItemScorer = (item: ClientItem) => number;
