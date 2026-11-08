import type { WowRegion } from "@/games/wow-forever/types/wowRegion";

/** `server_status`: a region only when the player named one; otherwise their saved region. */
export interface AskRegionInput {
  region: WowRegion | null;
}
