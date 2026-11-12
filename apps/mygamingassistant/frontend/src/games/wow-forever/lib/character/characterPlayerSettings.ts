import { playerLevel } from "@/games/wow-forever/data/levelCap";
import type { PlayerSettings } from "@/games/wow-forever/hooks/usePlayerSettings";
import { characterClassId } from "@/games/wow-forever/lib/character/characterClassId";
import type { CharacterResponse } from "@/games/wow-forever/types/character/characterResponse";
import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

const FACTIONS: Readonly<Record<string, PlayerFaction>> = {
  alliance: FACTION.alliance,
  horde: FACTION.horde,
};

/**
 * The character's faction, class and level as MGA's player settings (the map,
 * gear, food and trainer pages read them); null when MGA can't place the class or faction.
 */
export function playerSettingsFromCharacter(
  character: CharacterResponse,
): Pick<PlayerSettings, "faction" | "classId" | "level"> | null {
  const faction = FACTIONS[character.faction];
  const classId = characterClassId(character.class_name);
  if (!faction || !classId) return null;
  return { faction, classId, level: playerLevel(character.level) };
}

/** Whether the saved settings already say what the character does. */
export function settingsMatchCharacter(
  settings: Pick<PlayerSettings, "faction" | "classId" | "level">,
  wanted: Pick<PlayerSettings, "faction" | "classId" | "level">,
): boolean {
  return settings.faction === wanted.faction && settings.classId === wanted.classId && settings.level === wanted.level;
}
