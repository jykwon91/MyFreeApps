import rankTrainersJson from "@/games/wow-forever/data/worldMap/classic/classicRankTrainers.json";
import type { RankName, RankProfession, RankTrainer } from "@/games/wow-forever/data/professions/rankTrainerTypes";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** [npcId, name, faction, zoneId, where, x, y, city] — see `scripts/wow_world_map/rank_trainers.py`. */
type RankTrainerRow = readonly [number, string, "A" | "H" | "N", number, string, number, number, 0 | 1];

const BY_RANK = rankTrainersJson.trainers as unknown as Readonly<
  Record<RankProfession, Readonly<Record<RankName, readonly RankTrainerRow[]>>>
>;

/**
 * Everyone who teaches a rank to the chosen faction (neutral trainers too), capitals first.
 * Who teaches which rank is Classic (cmangos) data; Forever is unconfirmed.
 */
export function rankTrainers(profession: RankProfession, rank: RankName, faction: PlayerFaction): readonly RankTrainer[] {
  return BY_RANK[profession][rank]
    .filter((row) => row[2] === faction || row[2] === "N")
    .map(([npcId, name, , zoneId, where, x, y, city]) => ({ npcId, name, zoneId, where, x, y, city: city === 1 }));
}

/** Both factions' lists for a rank, ready for a `{ kind: "list" }` rank. */
export function listedRankTrainers(
  profession: RankProfession,
  rank: RankName,
): Readonly<Record<PlayerFaction, readonly RankTrainer[]>> {
  return { A: rankTrainers(profession, rank, "A"), H: rankTrainers(profession, rank, "H") };
}

/** The player's own zone first (they may already be standing next to one), the rest keep their order. */
export function orderRankTrainers(trainers: readonly RankTrainer[], zoneId: number | null): readonly RankTrainer[] {
  if (zoneId === null) return trainers;
  return [...trainers.filter((t) => t.zoneId === zoneId), ...trainers.filter((t) => t.zoneId !== zoneId)];
}
