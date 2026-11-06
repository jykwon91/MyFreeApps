import type { GatheringData } from "@/games/wow-forever/types/gathering/gatheringData";

export type GatheringDataState =
  | { status: "loading" }
  | { status: "error"; retry: () => void }
  | { status: "ready"; data: GatheringData };
