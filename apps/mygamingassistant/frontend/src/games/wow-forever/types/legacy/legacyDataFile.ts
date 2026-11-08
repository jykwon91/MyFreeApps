import type { LegacyCategory } from "@/games/wow-forever/types/legacy/legacyCategory";
import type { LegacyReward } from "@/games/wow-forever/types/legacy/legacyReward";
import type { LegacyTree } from "@/games/wow-forever/types/legacy/legacyTree";

/** `data/legacy/legacy.json` as `scripts.wow_legacy.build` writes it. */
export interface LegacyDataFile {
  source: string;
  build: number;
  attribution: string;
  currency: { id: number; cap: number; icon: number };
  pointCost: number;
  trees: LegacyTree[];
  categories: LegacyCategory[];
  rank: { currency: number; max: number; rewards: LegacyReward[] };
}
