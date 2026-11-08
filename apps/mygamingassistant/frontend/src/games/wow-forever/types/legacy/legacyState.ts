import type { LEGACY_STATUS } from "@/games/wow-forever/data/legacy/legacyConfig";
import type { LegacyData } from "@/games/wow-forever/types/legacy/legacyData";

/** The Legacy data's load state (its own lazy chunk). */
export type LegacyState =
  | { status: typeof LEGACY_STATUS.loading }
  | { status: typeof LEGACY_STATUS.ready; data: LegacyData }
  | { status: typeof LEGACY_STATUS.error; retry: () => void };
