import { LOAD_STATUS } from "@/games/wow-forever/data/loadStatus";
import type { ClientItemsState } from "@/games/wow-forever/hooks/useClientItems";
import { savedGearSpec } from "@/games/wow-forever/lib/auctionHouse/savedGearSpec";
import { characterClassId } from "@/games/wow-forever/lib/character/characterClassId";
import { verdictScoring } from "@/games/wow-forever/lib/itemCompare/verdictScoring";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";
import type { VerdictScoring } from "@/games/wow-forever/types/itemCompare/verdictScoring";

/**
 * How the saved character's upgrade verdicts are scored, or null until the character and item
 * list are loaded (or for a class MGA doesn't know). Reads the spec saved on Best gear each
 * render, so a spec changed in another tab applies the next time a tooltip opens.
 */
export function useVerdictScoring(character: CharacterResponse | undefined, items: ClientItemsState): VerdictScoring | null {
  const classId = character ? characterClassId(character.class_name) : undefined;
  if (!character || !classId || items.status !== LOAD_STATUS.ready) return null;
  return verdictScoring(classId, savedGearSpec(classId), character.level, items.list.clientBuild);
}
