import type { BossLootItem } from "@/games/wow-forever/types/dungeons/bossLootItem";
import type { RareClassification } from "@/games/wow-forever/types/rares/rareClassification";
import type { RareSpawn } from "@/games/wow-forever/types/rares/rareSpawn";

/**
 * A Classic rare / rare elite, or a rare the Forever client has met. Once the
 * client has met it (`seenOn` set), its name and classification are Forever's;
 * otherwise they're Classic data. Level, spawns and drops are always Classic
 * data, and missing when Classic doesn't have the creature (`classic` false).
 */
export interface Rare {
  id: number;
  name: string;
  classification: RareClassification;
  /** False for a rare new in Forever: no level, spawns or drops yet. */
  classic: boolean;
  /** When the Forever client was last seen to know it ("Confirmed in Forever"); null = Classic data only. */
  seenOn: string | null;
  minLevel: number | null;
  maxLevel: number | null;
  spawns: readonly RareSpawn[];
  /** The rare's own items, most likely first (Classic chances per kill). */
  drops: readonly BossLootItem[];
}
