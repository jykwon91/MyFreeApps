import type { WowClassId } from "@/games/wow-forever/data/classes";

const MAX_LEVEL = 60;

/**
 * Forever trains Warlock spells on even levels (foreverchanges.pro). Other
 * classes' Forever schedules aren't published, so they get no hint.
 */
export function nextWarlockTraining(classId: WowClassId, level: number | null): string | null {
  if (classId !== "warlock" || level === null) return null;
  if (level % 2 !== 0) return `Next Warlock training: level ${level + 1}.`;
  const now = `Level ${level} is a training level — visit your Warlock trainer.`;
  if (level >= MAX_LEVEL) return now;
  return `${now} Next one: level ${level + 2}.`;
}
