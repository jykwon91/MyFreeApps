import type { BossLootItem } from "@/games/wow-forever/types/dungeons/bossLootItem";
import type { RareClassification } from "@/games/wow-forever/types/rares/rareClassification";
import type { RareSpawn } from "@/games/wow-forever/types/rares/rareSpawn";

/**
 * A rare the Forever client knows: its name and classification are Forever's
 * (Game files); level, spawns and drops are Classic data, and missing when
 * Classic doesn't have the creature (`classic` false).
 */
export interface Rare {
  id: number;
  name: string;
  classification: RareClassification;
  /** False for a rare new in Forever: no level, spawns or drops yet. */
  classic: boolean;
  minLevel: number | null;
  maxLevel: number | null;
  spawns: readonly RareSpawn[];
  /** The rare's own items, most likely first (Classic chances per kill). */
  drops: readonly BossLootItem[];
}
