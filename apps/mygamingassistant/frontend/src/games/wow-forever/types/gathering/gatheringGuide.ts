import type { MobGatheringGuide } from "@/games/wow-forever/types/gathering/mobGatheringGuide";
import type { NodeGatheringGuide } from "@/games/wow-forever/types/gathering/nodeGatheringGuide";

/** Everything one gathering guide shows. Fill one per `GatheringProfession`; `kind` picks how "right now" works. */
export type GatheringGuide = NodeGatheringGuide | MobGatheringGuide;
