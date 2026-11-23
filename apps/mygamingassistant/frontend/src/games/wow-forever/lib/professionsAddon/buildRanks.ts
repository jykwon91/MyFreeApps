import type { CraftingRank, CraftingTrainers, RankTrainers } from "@/games/wow-forever/data/professions/crafting/craftingTrainers";
import { GATHERING_RANKS } from "@/games/wow-forever/data/professions/gathering/gatheringRanks";
import type { RouteStep } from "@/games/wow-forever/data/professions/professionTypes";
import type { RankProfession } from "@/games/wow-forever/data/professions/rankTrainerTypes";
import { listedRankTrainers } from "@/games/wow-forever/data/professions/rankTrainers";
import { npcPlace, rankTrainerPlace } from "@/games/wow-forever/lib/professionsAddon/npcPlace";
import { parseSkillSpan } from "@/games/wow-forever/lib/professionsAddon/parseSkillSpan";
import type { AddonFactionText } from "@/games/wow-forever/types/professionsAddon/addonFactionText";
import type { AddonPlace } from "@/games/wow-forever/types/professionsAddon/addonPlace";
import type { AddonRank } from "@/games/wow-forever/types/professionsAddon/addonRank";
import type { PlayerFaction } from "@/games/wow-forever/types/worldMap";

type Trainers = { A: AddonPlace[]; H: AddonPlace[] };

/** The skill cap each rank raises you to (Classic; every profession). */
const CAP_BY_RANK: Readonly<Record<string, number>> = { Apprentice: 75, Journeyman: 150, Expert: 225, Artisan: 300 };

const APPRENTICE = "Apprentice";
const APPRENTICE_SKILL = 1;

/** Capital-city trainers first, then the leveling-town ones, as the site lists them. */
export function trainerPlaces(trainers: CraftingTrainers): Trainers {
  const places = (faction: PlayerFaction): AddonPlace[] => [
    ...trainers.cities[faction].map(({ npc }) => npcPlace(npc)),
    ...trainers.towns[faction].map(npcPlace),
  ];
  return { A: places("A"), H: places("H") };
}

function apprentice(trainers: Trainers): AddonRank {
  return { name: APPRENTICE, skill: APPRENTICE_SKILL, level: null, cap: CAP_BY_RANK[APPRENTICE], trainers, how: null, headsUp: null, confirmed: true };
}

function rankTrainersText(trainers: RankTrainers): { places: Trainers; how: AddonFactionText | null } {
  if (trainers.kind === "list") {
    return { places: { A: trainers.trainers.A.map(rankTrainerPlace), H: trainers.trainers.H.map(rankTrainerPlace) }, how: null };
  }
  if (trainers.kind === "dungeon") return { places: { A: [], H: [] }, how: `${trainers.name} in ${trainers.dungeon}. ${trainers.detail}` };
  if (trainers.kind === "book") {
    const how = (f: PlayerFaction): string => `Buy ${trainers.book} (${trainers.price}) from ${trainers.vendors[f].name}. ${trainers.trip[f]}`;
    return {
      places: { A: [npcPlace(trainers.vendors.A)], H: [npcPlace(trainers.vendors.H)] },
      how: { A: how("A"), H: how("H") },
    };
  }
  const how = (f: PlayerFaction): string => `Quest ${trainers.quest} from ${trainers.givers[f].name}. ${trainers.detail[f]} ${trainers.trip[f]}`;
  return {
    places: { A: [npcPlace(trainers.givers.A)], H: [npcPlace(trainers.givers.H)] },
    how: { A: how("A"), H: how("H") },
  };
}

/** A crafting profession's ranks: Apprentice from the town and city trainers, then each rank-up the site lists. */
export function buildCraftingRanks(ranks: readonly CraftingRank[], trainers: CraftingTrainers): AddonRank[] {
  return [
    apprentice(trainerPlaces(trainers)),
    ...ranks.map((rank): AddonRank => {
      const { places, how } = rankTrainersText(rank.trainers);
      return {
        name: rank.name,
        skill: rank.skill,
        level: rank.level ?? null,
        cap: rank.cap,
        trainers: places,
        how,
        headsUp: rank.headsUp ?? null,
        confirmed: rank.confidence === "confirmed",
      };
    }),
  ];
}

/** A gathering profession's ranks: the guide lists one set of trainers, so every rank carries it. */
export function buildGatheringRanks(trainers: CraftingTrainers): AddonRank[] {
  const places = trainerPlaces(trainers);
  return GATHERING_RANKS.map((rank): AddonRank => ({
    name: rank.name,
    skill: rank.trainAt,
    level: rank.level,
    cap: rank.cap,
    trainers: places,
    how: null,
    headsUp: null,
    confirmed: rank.confidence === "confirmed",
  }));
}

/** Cooking and Fishing: Apprentice from the town and city trainers, the rest from the route's rank milestones. */
export function buildSecondaryRanks(profession: RankProfession, route: readonly RouteStep[], apprenticeTrainers: Trainers): AddonRank[] {
  const milestones = route.flatMap((entry) => (entry.kind === "milestone" && entry.teaches ? [{ entry, rank: entry.teaches.rank }] : []));
  return [
    apprentice(apprenticeTrainers),
    ...milestones.map(({ entry, rank }): AddonRank => {
      const listed = listedRankTrainers(profession, rank);
      return {
        name: rank,
        skill: parseSkillSpan(entry.skill).from,
        level: null,
        cap: CAP_BY_RANK[rank],
        trainers: {
          A: listed.A.map(rankTrainerPlace),
          H: listed.H.map(rankTrainerPlace),
        },
        how: entry.detail,
        headsUp: null,
        confirmed: entry.confidence === "confirmed",
      };
    }),
  ];
}
