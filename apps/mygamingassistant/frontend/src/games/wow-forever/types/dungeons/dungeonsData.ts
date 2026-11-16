import type { Dungeon } from "@/games/wow-forever/types/dungeons/dungeon";
import type { WorldZone } from "@/games/wow-forever/types/worldMap";

/** Every dungeon page, lowest level first, and the client build its Forever facts come from. */
export interface DungeonsData {
  dungeons: readonly Dungeon[];
  clientBuild: string;
  /** The World Map's zones and continents, to place quest givers on a continent map. */
  zones: readonly WorldZone[];
}
