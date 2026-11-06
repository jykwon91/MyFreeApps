import type { WorldZone } from "@/games/wow-forever/types/worldMap";

/** Data that carries Forever's zones — the capped banner names the trainer in your zone from it. */
export interface ZonedData {
  zoneById: ReadonlyMap<number, WorldZone>;
}
