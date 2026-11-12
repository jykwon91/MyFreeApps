import { treePoints } from "@/games/wow-forever/lib/talents/talentRules";
import type { TalentBuild } from "@/games/wow-forever/types/talents/talentBuild";

/** The tree with the most points (a build opens on its main tree), else the first. */
export function mainTree(build: TalentBuild): number {
  let best = 0;
  build.forEach((_ranks, i) => {
    if (treePoints(build, i) > treePoints(build, best)) best = i;
  });
  return best;
}
