import type { QuestGiver } from "@/games/wow-forever/types/dungeons/questGiver";

/** Givers out in the world by name; null when two different NPCs share the name, so it can't say which one. */
export function placedGiversByName(givers: readonly QuestGiver[]): ReadonlyMap<string, QuestGiver | null> {
  const found = new Map<string, QuestGiver | null>();
  for (const giver of givers) {
    if (!giver.place || giver.insideDungeon) continue;
    const seen = found.get(giver.name);
    found.set(giver.name, seen === undefined || seen?.id === giver.id ? giver : null);
  }
  return found;
}

/** Who a quest goes back to, when that's one NPC whose spot we know; quests have only the ender's name. */
export function turnInGiver(enders: readonly string[], givers: ReadonlyMap<string, QuestGiver | null>): QuestGiver | null {
  return enders.length === 1 ? (givers.get(enders[0]) ?? null) : null;
}
