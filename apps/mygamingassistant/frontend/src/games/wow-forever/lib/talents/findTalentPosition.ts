import type { TalentPosition } from "@/games/wow-forever/types/talents/talentPosition";
import type { TalentTree } from "@/games/wow-forever/types/talents/talentTree";

/** Where the talent with this id is (a `?talent=` link), or null for a missing, malformed or other-class id. */
export function findTalentPosition(trees: readonly TalentTree[], rawId: string | null): TalentPosition | null {
  if (!rawId || !/^\d+$/.test(rawId)) return null;
  const id = Number(rawId);
  for (let tree = 0; tree < trees.length; tree += 1) {
    const talent = trees[tree].talents.findIndex((t) => t.id === id);
    if (talent >= 0) return { tree, talent };
  }
  return null;
}
