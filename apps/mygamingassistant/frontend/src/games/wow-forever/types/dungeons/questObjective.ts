import type { QuestTargetKind } from "@/games/wow-forever/types/dungeons/questTargetKind";

/** One thing to kill, use or collect. */
export interface QuestObjective {
  kind: QuestTargetKind;
  /** The Classic name of the creature, object or item. */
  name: string;
  count: number;
  /** True when it's found only inside this dungeon. */
  insideDungeon: boolean;
}
