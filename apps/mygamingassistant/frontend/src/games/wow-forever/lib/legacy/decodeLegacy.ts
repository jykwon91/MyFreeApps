import type { LegacyData } from "@/games/wow-forever/types/legacy/legacyData";
import type { LegacyDataFile } from "@/games/wow-forever/types/legacy/legacyDataFile";

/** The generated file as the planner uses it: the cap, trees, challenges and rank rewards. */
export function decodeLegacy(file: LegacyDataFile): LegacyData {
  const challengeIds = file.categories.flatMap((category) =>
    category.groups.flatMap((group) => group.challenges.map((challenge) => challenge.id)),
  );
  return {
    cap: file.currency.cap,
    pointIcon: file.currency.icon,
    trees: file.trees,
    categories: file.categories,
    challengeIds,
    rankMax: file.rank.max,
    rewards: [...file.rank.rewards].sort((a, b) => a.rank - b.rank),
  };
}
