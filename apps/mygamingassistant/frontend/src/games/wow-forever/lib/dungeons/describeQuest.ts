import { findClass } from "@/games/wow-forever/data/classes";
import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";
import type { QuestObjective } from "@/games/wow-forever/types/dungeons/questObjective";
import { QUEST_TARGET_KIND, type QuestTargetKind } from "@/games/wow-forever/types/dungeons/questTargetKind";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

const OBJECTIVE_VERB: Readonly<Record<QuestTargetKind, string>> = {
  [QUEST_TARGET_KIND.npc]: "Kill",
  [QUEST_TARGET_KIND.object]: "Use",
  [QUEST_TARGET_KIND.item]: "Collect",
};

/** The quests a player of this faction can take: theirs and the ones for both sides, in the page's order. */
export function questsForFaction(quests: readonly DungeonQuest[], faction: PlayerFaction): DungeonQuest[] {
  return quests.filter((q) => q.side === faction || q.side === FACTION.neutral);
}

/** "Level 24 · from level 20". */
export function questLevelText(quest: Pick<DungeonQuest, "level" | "minLevel">): string {
  return quest.minLevel > 0 && quest.minLevel !== quest.level
    ? `Level ${quest.level} · from level ${quest.minLevel}`
    : `Level ${quest.level}`;
}

/** "Warrior, Paladin"; "" when every class may take it. */
export function questClassesText(quest: Pick<DungeonQuest, "classes">): string {
  return quest.classes.map((id) => findClass(id)?.name ?? id).join(", ");
}

/** "Kill Edwin VanCleef", "Collect Red Silk Bandana × 10". */
export function objectiveText(objective: Pick<QuestObjective, "kind" | "name" | "count">): string {
  const count = objective.count > 1 ? ` × ${objective.count}` : "";
  return `${OBJECTIVE_VERB[objective.kind]} ${objective.name}${count}`;
}

/** "× 5" after a reward's name; "" for one. */
export function rewardCountText(count: number): string {
  return count > 1 ? `× ${count}` : "";
}
