/** How many rows each tier (and all of them) would show. */
export type TierCounts<T extends string> = Record<T, number> & { all: number };
