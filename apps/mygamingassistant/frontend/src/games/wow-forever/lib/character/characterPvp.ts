import { PVP_FAILED_SUMMARY, PVP_RANK_SOURCE_NOTE, PVP_UNRANKED_LABEL } from "@/games/wow-forever/data/character/characterPvpConfig";
import { formatWhole } from "@/games/wow-forever/lib/character/formatWhole";
import type { CharacterPvp } from "@/games/wow-forever/types/character/characterPvp";
import type { CharacterStatLine } from "@/games/wow-forever/types/character/characterStatLine";

/** "Rank 3", or "Unranked" for Blizzard's 0. Titles wait until a ranked character shows Forever's scale. */
export function pvpRankLabel(rank: number): string {
  if (rank <= 0) return PVP_UNRANKED_LABEL;
  return `Rank ${rank}`;
}

/** "21 honorable kills" / "1 honorable kill". */
export function formatHonorableKills(count: number): string {
  const noun = count === 1 ? "honorable kill" : "honorable kills";
  return `${formatWhole(count)} ${noun}`;
}

/** The closed section's line: "Unranked · 21 honorable kills". */
export function pvpSummary(pvp: CharacterPvp | null): string {
  if (pvp === null) return PVP_FAILED_SUMMARY;
  return `${pvpRankLabel(pvp.rank)} · ${formatHonorableKills(pvp.honorable_kills)}`;
}

/** "Most in Eastern Kingdoms (17)", or null before the first honorable kill. */
export function topHonorContinent(pvp: CharacterPvp): string | null {
  if (pvp.top_honor_continent === null || pvp.top_honor_continent_kills === null) return null;
  return `Most in ${pvp.top_honor_continent} (${formatWhole(pvp.top_honor_continent_kills)})`;
}

/** The list under the tiles; a line Blizzard didn't send is left out. */
export function pvpRows(pvp: CharacterPvp): CharacterStatLine[] {
  const rows: CharacterStatLine[] = [];
  if (pvp.deaths_from_players !== null) {
    rows.push({ label: "Deaths to players", value: formatWhole(pvp.deaths_from_players), bonus: null });
  }
  if (pvp.deaths_from_opposite_faction !== null) {
    rows.push({ label: "Deaths to the other faction", value: formatWhole(pvp.deaths_from_opposite_faction), bonus: null });
  }
  return rows;
}

/** Nothing at all yet: no rank, no kills, and Blizzard counted no deaths to players (unknown isn't nothing). */
export function hasNoPvp(pvp: CharacterPvp): boolean {
  return pvp.rank <= 0 && pvp.honorable_kills === 0 && pvp.deaths_from_players === 0;
}

/** Under an unranked character's rank: where ranks come from. */
export function pvpRankDetail(rank: number): string | null {
  if (rank > 0) return null;
  return PVP_RANK_SOURCE_NOTE;
}
