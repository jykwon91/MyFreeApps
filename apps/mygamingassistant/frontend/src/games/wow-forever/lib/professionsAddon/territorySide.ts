import type { AddonSide } from "@/games/wow-forever/types/professionsAddon/addonSide";
import { TERRITORY, type Territory } from "@/games/wow-forever/types/worldMap";

const SIDE_BY_TERRITORY: Readonly<Record<Territory, AddonSide>> = {
  [TERRITORY.alliance]: "A",
  [TERRITORY.horde]: "H",
  [TERRITORY.contested]: "C",
};

/** Whose ground a zone is, in the addon's one-letter form; null when the data doesn't say. */
export function territorySide(territory: Territory | null): AddonSide {
  return territory === null ? null : SIDE_BY_TERRITORY[territory];
}
