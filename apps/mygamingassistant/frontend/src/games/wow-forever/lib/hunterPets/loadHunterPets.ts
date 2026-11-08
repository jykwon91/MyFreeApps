import { decodeHunterPets } from "@/games/wow-forever/lib/hunterPets/decodeHunterPets";
import type { HunterPetsData } from "@/games/wow-forever/types/hunterPets/hunterPetsData";
import type { HunterPetsDataFiles } from "@/games/wow-forever/types/hunterPets/hunterPetsDataFiles";

let cached: Promise<HunterPetsData> | null = null;

/** The Hunter pets data, loaded once in its own chunks (a failed load is tried again next time). */
export function loadHunterPets(): Promise<HunterPetsData> {
  if (!cached) {
    cached = Promise.all([
      import("@/games/wow-forever/data/hunterPets/hunterPets.json"),
      import("@/games/wow-forever/data/hunterPets/classic/tamableBeasts.json"),
    ]).then(([forever, classic]) =>
      decodeHunterPets({ forever: forever.default, classic: classic.default } as unknown as HunterPetsDataFiles),
    );
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
