import type { Race } from "@/games/wow-forever/types/races/race";

/** The races page's data, decoded. */
export interface RacesData {
  /** Alliance then Horde, in character-creation order, races new in Forever last. */
  races: readonly Race[];
  clientBuild: string;
  classicBuild: string;
}
