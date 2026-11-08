import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { QuestChainStep } from "@/games/wow-forever/types/dungeons/questChainStep";
import type { QuestGiver } from "@/games/wow-forever/types/dungeons/questGiver";
import type { QuestObjective } from "@/games/wow-forever/types/dungeons/questObjective";
import type { QuestReward } from "@/games/wow-forever/types/dungeons/questReward";
import type { Faction } from "@/games/wow-forever/types/worldMap";

/**
 * One quest on a dungeon page. Every quest is in the Forever client (`QuestV2`).
 * When the operator's client has seen it (`seenOn`), its title, levels,
 * objectives and rewards are the client's; otherwise they, like everything
 * else here, are Classic data.
 */
export interface DungeonQuest {
  id: number;
  title: string;
  /** The quest's level; a "your level" quest shows the level you can take it at. */
  level: number;
  minLevel: number;
  /** Alliance, Horde or both ("N"). */
  side: Faction;
  /** Empty = every class. */
  classes: readonly WowClassId[];
  givers: readonly QuestGiver[];
  /** The quests before it, earliest first; empty when it starts on its own. */
  chain: readonly QuestChainStep[];
  objectives: readonly QuestObjective[];
  /** You get all of these. */
  rewards: readonly QuestReward[];
  /** You choose one of these. */
  choices: readonly QuestReward[];
  /** Who takes it back (Classic names). */
  enders: readonly string[];
  /** The day the operator's client last wrote its quest cache (YYYY-MM-DD), or null when it hasn't seen this quest. */
  seenOn: string | null;
}
