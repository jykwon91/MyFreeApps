import { decodeRaces } from "@/games/wow-forever/lib/races/decodeRaces";
import type { RacesData } from "@/games/wow-forever/types/races/racesData";
import type { RacesDataFiles } from "@/games/wow-forever/types/races/racesDataFiles";

let cached: Promise<RacesData> | null = null;

/** The races page's data, loaded once in its own chunks (a failed load is tried again next time). */
export function loadRaces(): Promise<RacesData> {
  if (!cached) {
    cached = Promise.all([
      import("@/games/wow-forever/data/races/races.json"),
      import("@/games/wow-forever/data/races/classic/racials.json"),
    ]).then(([forever, classic]) =>
      decodeRaces({ forever: forever.default, classic: classic.default } as unknown as RacesDataFiles),
    );
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
