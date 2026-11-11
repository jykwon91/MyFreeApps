import type { TrainerServiceRow } from "@/games/wow-forever/types/trainers/trainerServiceRow";
import type { TrainerServices } from "@/games/wow-forever/types/trainers/trainerServices";

let cached: Promise<TrainerServices> | null = null;

/** The World Map's service NPCs and zones, in their own chunks, once per page session. */
export function loadTrainerServices(): Promise<TrainerServices> {
  if (!cached) {
    cached = Promise.all([
      import("@/games/wow-forever/data/worldMap/classic/classicServices.json"),
      import("@/games/wow-forever/data/worldMap/zones.json"),
    ]).then(([services, zones]) => ({
      rows: services.default.rows as unknown as readonly TrainerServiceRow[],
      zones: zones.default.zones,
    }));
    // A failed load (offline, bad deploy) must be retryable.
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
