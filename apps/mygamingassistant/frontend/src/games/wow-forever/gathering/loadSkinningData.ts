import { decodeSkinning } from "@/games/wow-forever/gathering/decodeSkinning";
import { loadZoneById } from "@/games/wow-forever/gathering/loadZoneById";
import type { MobGatheringGuide } from "@/games/wow-forever/types/gathering/mobGatheringGuide";
import type { SkinningData } from "@/games/wow-forever/types/gathering/skinningData";

/** The guide's mob file (Classic levels, spawns and skins) and Forever's zones. */
export async function loadSkinningData(guide: MobGatheringGuide): Promise<SkinningData> {
  const [file, zoneById] = await Promise.all([guide.load(), loadZoneById()]);
  return { ...decodeSkinning(file), zoneById };
}
