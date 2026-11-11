import type { TrainerServiceRow } from "@/games/wow-forever/types/trainers/trainerServiceRow";
import type { TrainerZone } from "@/games/wow-forever/types/trainers/trainerZone";

/** The World Map's service NPCs and zones, loaded for the trainers page. */
export interface TrainerServices {
  rows: readonly TrainerServiceRow[];
  zones: readonly TrainerZone[];
}
