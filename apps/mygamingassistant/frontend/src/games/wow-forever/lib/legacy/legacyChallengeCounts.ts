import type { LegacyCategory } from "@/games/wow-forever/types/legacy/legacyCategory";

/** Points from the ticked challenges (the whole account's, not one character's). */
export function earnedPoints(categories: readonly LegacyCategory[], ticked: ReadonlySet<string>): number {
  return categories.reduce(
    (sum, category) =>
      sum +
      category.groups.reduce(
        (groupSum, group) =>
          groupSum + group.challenges.reduce((s, c) => (ticked.has(c.id) ? s + c.points : s), 0),
        0,
      ),
    0,
  );
}

/** [ticked, total] challenges in one category. */
export function categoryTicks(category: LegacyCategory, ticked: ReadonlySet<string>): [number, number] {
  const all = category.groups.flatMap((group) => group.challenges);
  return [all.filter((c) => ticked.has(c.id)).length, all.length];
}
