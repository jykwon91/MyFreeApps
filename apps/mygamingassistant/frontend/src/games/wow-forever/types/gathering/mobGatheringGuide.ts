import type { GatheringGuideBase } from "@/games/wow-forever/types/gathering/gatheringGuideBase";
import type { GATHERING_KIND } from "@/games/wow-forever/types/gathering/gatheringKind";
import type { SkinningFile } from "@/games/wow-forever/types/gathering/skinningFile";

/** A guide that gathers from mobs (Skinning): the mob levels your skill and level reach, and where those mobs are. */
export interface MobGatheringGuide extends GatheringGuideBase {
  kind: typeof GATHERING_KIND.mobs;
  /** The generated mob file — loaded only when the guide opens. */
  load: () => Promise<SkinningFile>;
}
