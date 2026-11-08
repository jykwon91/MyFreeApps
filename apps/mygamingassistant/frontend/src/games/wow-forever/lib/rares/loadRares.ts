import { decodeRares } from "@/games/wow-forever/lib/rares/decodeRares";
import type { RareDataFiles } from "@/games/wow-forever/types/rares/rareDataFiles";
import type { RaresData } from "@/games/wow-forever/types/rares/raresData";

let cached: Promise<RaresData> | null = null;

/** The rares finder's data, loaded once in its own chunks for the list page and the map layer (a failed load is tried again next time). */
export function loadRares(): Promise<RaresData> {
  if (!cached) {
    cached = Promise.all([
      import("@/games/wow-forever/data/rares/rares.json"),
      import("@/games/wow-forever/data/rares/classic/rareSpawns.json"),
    ]).then(([forever, classic]) =>
      decodeRares({ forever: forever.default, classic: classic.default } as unknown as RareDataFiles),
    );
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
