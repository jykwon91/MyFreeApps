import { decodeLegacy } from "@/games/wow-forever/lib/legacy/decodeLegacy";
import type { LegacyData } from "@/games/wow-forever/types/legacy/legacyData";
import type { LegacyDataFile } from "@/games/wow-forever/types/legacy/legacyDataFile";

let cached: Promise<LegacyData> | null = null;

/** The Legacy planner's data, loaded once in its own chunk (a failed load is tried again next time). */
export function loadLegacy(): Promise<LegacyData> {
  if (!cached) {
    cached = import("@/games/wow-forever/data/legacy/legacy.json").then((file) =>
      decodeLegacy(file.default as unknown as LegacyDataFile),
    );
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
