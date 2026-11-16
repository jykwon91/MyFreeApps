import type { QuestLine } from "@/games/wow-forever/types/dungeons/questLine";
import type { QuestLineStatus } from "@/games/wow-forever/types/dungeons/questLineStatus";

/** How many steps come before the line's dungeon quest(s) — the part you do in order. */
function beforeCount(line: QuestLine): number {
  return line.steps.length - line.titles.length;
}

/**
 * Where you are in a line: how many steps are ticked, and the next one to do
 * (the first unticked step before the dungeon quests, else the first unticked
 * dungeon quest; null when all are done).
 */
export function questLineStatus(line: QuestLine, done: ReadonlySet<number>): QuestLineStatus {
  const doneCount = line.steps.filter((s) => done.has(s.id)).length;
  const nextIndex = line.steps.findIndex((s) => !done.has(s.id));
  return { doneCount, nextIndex: nextIndex === -1 ? null : nextIndex };
}

/**
 * The quests ticking step `index` marks done: it and every step before it in
 * the line (you can't do step 3 without 1 and 2). The line's dungeon quests are
 * side by side, so ticking one doesn't tick the others.
 */
export function idsDoneWith(line: QuestLine, index: number): number[] {
  const before = beforeCount(line);
  const upTo = line.steps.slice(0, Math.min(index, before)).map((s) => s.id);
  return [...upTo, line.steps[index].id];
}

/** The quests unticking step `index` marks not done: it and every step after it (a dungeon quest only itself). */
export function idsUndoneWith(line: QuestLine, index: number): number[] {
  if (index >= beforeCount(line)) return [line.steps[index].id];
  return line.steps.slice(index).map((s) => s.id);
}
