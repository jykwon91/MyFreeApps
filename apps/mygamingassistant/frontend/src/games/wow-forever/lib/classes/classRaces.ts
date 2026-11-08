import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { Race } from "@/games/wow-forever/types/races/race";

/** One race that can play a class, with whether the combo is new in Forever. */
export interface ClassRace {
  slug: string;
  name: string;
  /** This class/race combo did not exist in Classic Era. */
  isNew: boolean;
}

/** All races that can be a given class, in character-creation order (Alliance then Horde). */
export function racesForClass(classId: WowClassId, races: readonly Race[]): readonly ClassRace[] {
  return races
    .filter((r) => r.classes.includes(classId))
    .map((r) => ({ slug: r.slug, name: r.name, isNew: r.newClasses.includes(classId) }));
}
