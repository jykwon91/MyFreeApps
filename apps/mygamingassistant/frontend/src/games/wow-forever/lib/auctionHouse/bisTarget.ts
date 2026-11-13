import { BIS_LEVEL } from "@/games/wow-forever/data/auctionHouse/auctionBisOptions";
import { findClass, findSpec, type WowClassId } from "@/games/wow-forever/data/classes";
import type { BisTarget } from "@/games/wow-forever/types/auctionHouse/bisTarget";

/** The level and class the picks are for; the spec is named only at the top level, since below it the leveling weights ignore spec. Pure. */
export function bisTarget(level: number, classId: WowClassId, specId: string): BisTarget {
  const className = findClass(classId)?.name ?? classId;
  const specName = level >= BIS_LEVEL ? findSpec(classId, specId)?.name : undefined;
  return { level, label: specName ? `${specName} ${className}` : className };
}
