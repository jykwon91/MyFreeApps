import { questsForFaction } from "@/games/wow-forever/lib/dungeons/describeQuest";
import type { DungeonQuest } from "@/games/wow-forever/types/dungeons/dungeonQuest";
import type { QuestLine } from "@/games/wow-forever/types/dungeons/questLine";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

type LineQuest = Pick<DungeonQuest, "id" | "title" | "level" | "minLevel" | "side" | "classes" | "givers" | "pickupSteps">;

/**
 * Each dungeon quest's line for one faction: the quests before it, in order,
 * then the quest itself — in the page's order (lowest level first). A dungeon
 * quest that another listed quest's line already passes through isn't given a
 * line of its own; it's a step (marked as a dungeon quest) in that longer one.
 * Dungeon quests with the same quests before them and the same classes share a line.
 */
export function questLines(quests: readonly LineQuest[], faction: PlayerFaction): QuestLine[] {
  const shown = questsForFaction(quests, faction);
  const dungeonIds = new Set(shown.map((q) => q.id));
  const passedThrough = new Set(shown.flatMap((q) => q.pickupSteps.map((s) => s.id)));
  const lines = new Map<string, QuestLine>();
  for (const q of shown) {
    if (passedThrough.has(q.id)) continue;
    const before = questsForFaction(q.pickupSteps, faction);
    const final = { id: q.id, title: q.title, level: q.level, minLevel: q.minLevel, giver: q.givers[0] ?? null, dungeonQuest: true };
    // Dungeon quests with exactly the same quests before them (and the same classes) share one line.
    const key = before.length > 0 ? `${before.map((s) => s.id).join(",")}|${[...q.classes].sort().join(",")}` : `alone:${q.id}`;
    const shared = lines.get(key);
    if (shared) {
      lines.set(key, { ...shared, titles: [...shared.titles, q.title], steps: [...shared.steps, final] });
      continue;
    }
    lines.set(key, {
      id: q.id,
      titles: [q.title],
      classes: q.classes,
      steps: [
        ...before.map((s) => ({ id: s.id, title: s.title, level: s.level, minLevel: s.minLevel, giver: s.giver, dungeonQuest: dungeonIds.has(s.id) })),
        final,
      ],
    });
  }
  return [...lines.values()];
}
