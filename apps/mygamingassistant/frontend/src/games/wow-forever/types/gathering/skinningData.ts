import type { LeatherBracket } from "@/games/wow-forever/types/gathering/leatherBracket";
import type { SkinnableMob } from "@/games/wow-forever/types/gathering/skinnableMob";
import type { ZonedData } from "@/games/wow-forever/types/gathering/zonedData";

/** What a mob guide loads: every skinnable mob, leather by mob level, and Forever's zones. */
export interface SkinningData extends ZonedData {
  mobs: readonly SkinnableMob[];
  leather: readonly LeatherBracket[];
}
