import type { QuestGiverPlace } from "@/games/wow-forever/types/dungeons/questGiverPlace";
import type { QuestTargetKind } from "@/games/wow-forever/types/dungeons/questTargetKind";

/** Who (or what) starts a quest (Classic data). */
export interface QuestGiver {
  kind: QuestTargetKind;
  name: string;
  /** Out in the world, placed like the World Map places it; null when it isn't on a zone map. */
  place: QuestGiverPlace | null;
  /** True when it's found only inside this dungeon. */
  insideDungeon: boolean;
}
