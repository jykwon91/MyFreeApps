import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { WeightBracket } from "@/games/wow-forever/data/weights/statWeights";

/** Persisted Item Compare settings (localStorage). */
export interface CompareSettings {
  classId: WowClassId;
  /** A spec id of the class, or LEVELING_SPEC_ID. */
  specId: string;
  bracket: WeightBracket;
  /** Hit % from the rest of the user's gear (excluding the slot being compared); null = unknown. */
  currentHitPct: number | null;
}
