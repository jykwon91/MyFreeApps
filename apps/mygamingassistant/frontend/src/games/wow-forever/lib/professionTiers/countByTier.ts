import type { TierCounts } from "@/games/wow-forever/types/professionTiers/tierCounts";

/** How many of `rows` fall in each tier, plus the total. */
export function countByTier<R, T extends string>(rows: readonly R[], tiers: readonly T[], tierOf: (row: R) => T): TierCounts<T> {
  const perTier = new Map<T, number>(tiers.map((tier) => [tier, 0]));
  for (const row of rows) {
    const tier = tierOf(row);
    perTier.set(tier, (perTier.get(tier) ?? 0) + 1);
  }
  return { all: rows.length, ...Object.fromEntries(perTier) } as TierCounts<T>;
}
