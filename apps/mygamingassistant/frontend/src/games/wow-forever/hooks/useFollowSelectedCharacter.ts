import { useEffect } from "react";
import { followCharacterSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { useSelectedCharacter } from "@/games/wow-forever/hooks/useSelectedCharacter";
import { playerSettingsFromCharacter } from "@/games/wow-forever/lib/character/characterPlayerSettings";

/**
 * Keeps the saved faction / class / level on the selected character's current ones (it levels up, Blizzard
 * refreshes), except for what the player typed over. Mounted once, in the app layout.
 */
export function useFollowSelectedCharacter(): void {
  const { character } = useSelectedCharacter();
  useEffect(() => {
    const wanted = character ? playerSettingsFromCharacter(character) : null;
    if (wanted) followCharacterSettings(wanted);
  }, [character]);
}
