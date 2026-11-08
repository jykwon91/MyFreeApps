import goldFarmsJson from "@/games/wow-forever/data/gold/classic/goldFarms.json";
import { decodeGoldFarms, type GoldFarm } from "@/games/wow-forever/gold/goldFarms";
import type { GoldFarmsFile } from "@/games/wow-forever/gold/goldFarmsFile";

let decoded: GoldFarm[] | null = null;

/** Every farm, decoded once — bundled with the Making gold page. */
export function goldFarms(): readonly GoldFarm[] {
  decoded ??= decodeGoldFarms(goldFarmsJson as unknown as GoldFarmsFile);
  return decoded;
}
