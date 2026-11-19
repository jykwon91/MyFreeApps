import type { CrateRow } from "@/games/wow-forever/types/crates/crateRow";

/** What a crate search looks at: the crate's name and every bundle's material. */
export function crateSearchHaystacks(row: CrateRow): string[] {
  return [row.crate.name, ...row.crate.bundles.map((b) => b.item.name)];
}
