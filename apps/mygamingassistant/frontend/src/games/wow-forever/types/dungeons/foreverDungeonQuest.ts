import type { ForeverQuestReputation } from "@/games/wow-forever/types/dungeons/foreverQuestReputation";
import type { ForeverQuestSeen } from "@/games/wow-forever/types/dungeons/foreverQuestSeen";
import type { ForeverQuestStanding } from "@/games/wow-forever/types/dungeons/foreverQuestStanding";
import type { QuestReward } from "@/games/wow-forever/types/dungeons/questReward";
import type { Faction } from "@/games/wow-forever/types/worldMap";

/**
 * One quest of a dungeon Forever added, from Blizzard's Game Data API
 * (`dungeons/foreverDungeonQuests.json`). The API has no level, giver or
 * objectives; `seen` adds the level when the operator's client has seen it.
 */
export interface ForeverDungeonQuest {
  id: number;
  title: string;
  /** Alliance, Horde or both ("N"). */
  side: Faction;
  /** Blizzard's quest type ("Dungeon", "Elite"); null when it gives none. */
  type: string | null;
  repeatable: boolean;
  /** Class names; empty = every class. */
  classes: readonly string[];
  needsReputation: readonly ForeverQuestStanding[];
  xp: number;
  /** In copper. */
  money: number;
  reputations: readonly ForeverQuestReputation[];
  items: readonly QuestReward[];
  /** True when you choose one of `items`, false when you get them all. */
  itemsChoice: boolean;
  /** A spell the quest rewards ("Teleport: Dalaran"). */
  spell: string | null;
  description: string;
  seen: ForeverQuestSeen | null;
}
