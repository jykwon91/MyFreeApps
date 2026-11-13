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
export function questsForFaction<Q extends Pick<DungeonQuest, "side">>(quests: readonly Q[], faction: PlayerFaction): Q[] {
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

/** "Step 3 of 5" in the quest's line; null when it stands alone. */
export function questStepText(quest: Pick<DungeonQuest, "chain" | "after">): string | null {
  const step = quest.chain.length + 1;
  const of = step + quest.after.length;
  return of > 1 ? `Step ${step} of ${of}` : null;
}

/** "then 2 more quests" after the listed ones; null when they're all listed. */
export function moreQuestsText(more: number): string | null {
  if (more <= 0) return null;
  return more === 1 ? "then 1 more quest" : `then ${more} more quests`;
}

/** "Kill", "Use", "Collect". */
export function objectiveVerb(kind: QuestTargetKind): string {
  return OBJECTIVE_VERB[kind];
}

/** " × 10" after an objective's name; "" for one. */
export function objectiveCountText(count: number): string {
  return count > 1 ? ` × ${count}` : "";
}

/** "Kill Edwin VanCleef", "Collect Red Silk Bandana × 10". */
export function objectiveText(objective: Pick<QuestObjective, "kind" | "name" | "count">): string {
  return `${objectiveVerb(objective.kind)} ${objective.name}${objectiveCountText(objective.count)}`;
}

/** "× 5" after a reward's name; "" for one. */
export function rewardCountText(count: number): string {
  return count > 1 ? `× ${count}` : "";
}
