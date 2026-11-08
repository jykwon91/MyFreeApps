import { decodeGoldFarms, type GoldFarm } from "@/games/wow-forever/gold/goldFarms";
import type { GoldFarmsFile } from "@/games/wow-forever/gold/goldFarmsFile";

let cached: Promise<readonly GoldFarm[]> | null = null;

/** Every farm, loaded in its own chunk the first time Ask needs it (a failed load is tried again next time). */
export function loadGoldFarms(): Promise<readonly GoldFarm[]> {
  if (!cached) {
    cached = import("@/games/wow-forever/data/gold/classic/goldFarms.json").then((file) =>
      decodeGoldFarms(file.default as unknown as GoldFarmsFile),
    );
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
