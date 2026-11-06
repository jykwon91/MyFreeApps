import { GATHERING_RANKS } from "@/games/wow-forever/data/professions/gathering/gatheringRanks";
import { MINING_TRAINERS } from "@/games/wow-forever/data/professions/gathering/gatheringTrainers";
import {
  MINING_FOREVER_CHANGES,
  MINING_NODES,
  MINING_ROUTE,
  MINING_STEPS,
} from "@/games/wow-forever/data/professions/gathering/mining";
import type { GatheringGuide } from "@/games/wow-forever/types/gathering/gatheringGuide";
import type { GatheringProfession } from "@/games/wow-forever/types/gathering/gatheringProfession";
import type { MiningFile } from "@/games/wow-forever/types/gathering/miningFile";

/** One guide per gathering profession — Herbalism adds an entry here. */
export const GATHERING_GUIDES: Readonly<Record<GatheringProfession, GatheringGuide>> = {
  mining: {
    label: "Mining",
    verb: "mine",
    nodeLabel: "Ore",
    nodes: MINING_NODES,
    ranks: GATHERING_RANKS,
    trainers: MINING_TRAINERS,
    trainerNote: "Forever adds a Junior Mining Trainer in every starting area. They aren't on the World Map yet, and only teach up to 75.",
    steps: MINING_STEPS,
    route: MINING_ROUTE,
    routeIntro: "Mine each vein until it turns green, then move on to the next row's zones.",
    routeColumns: { name: "Ore", materials: "Where", source: "Tip" },
    forever: MINING_FOREVER_CHANGES,
    crafts: {
      title: "Smelting",
      intro: "Smelting turns ore into bars and gives Mining skill too. Each one is cast standing next to the object it names.",
      load: () => import("@/games/wow-forever/data/professions/crafting/mining.json").then((m) => m.default as MiningFile),
    },
  },
};
