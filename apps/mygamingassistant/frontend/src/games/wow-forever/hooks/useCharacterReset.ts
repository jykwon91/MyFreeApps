import { useCallback } from "react";
import { usePlayerOverrides, usePlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useSelectedCharacter } from "@/games/wow-forever/hooks/useSelectedCharacter";
import { playerSettingsFromCharacter } from "@/games/wow-forever/lib/character/characterPlayerSettings";
import { selectCharacter } from "@/games/wow-forever/lib/character/selectCharacter";
import type { CharacterDefaultState } from "@/games/wow-forever/types/character/characterDefaultState";

/**
 * The selected character's faction / class / level as the page default. Null with no character
 * selected; `overridden` once the player typed one of them over the character's own.
 */
export function useCharacterReset(): CharacterDefaultState | null {
  const { slug, name, character } = useSelectedCharacter();
  const [, update] = usePlayerSettings();
  const overrides = usePlayerOverrides();
  const wanted = character ? playerSettingsFromCharacter(character) : null;
  const reset = useCallback(() => {
    if (wanted) selectCharacter(wanted, update);
  }, [wanted, update]);
  if (!slug || !name) return null;
  return { characterName: name, overridden: wanted !== null && overrides.length > 0, reset };
}
