import { CRAFT_SKILL_STORAGE_KEY } from "@/games/wow-forever/hooks/useCraftingSkill";
import type { PlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import type { CharacterPlayerSettings } from "@/games/wow-forever/lib/character/characterPlayerSettings";
import { removeStored } from "@/games/wow-forever/lib/safeLocalStorage";

/** What the player typed on a page that a (re)selected character replaces. */
const PAGE_OVERRIDE_KEYS: readonly string[] = [CRAFT_SKILL_STORAGE_KEY];

/** Selects the character: its faction, class and level replace what was typed, on the map and on every page that kept its own. */
export function selectCharacter(wanted: CharacterPlayerSettings, update: (patch: Partial<PlayerSettings>) => void): void {
  PAGE_OVERRIDE_KEYS.forEach(removeStored);
  update(wanted);
}
