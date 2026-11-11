import { FACTION, type PlayerFaction } from "@/games/wow-forever/types/worldMap";

/** Alliance / Horde, for the pages that ask which side you play. */
export const PLAYER_FACTION_OPTIONS: readonly { id: PlayerFaction; label: string }[] = [
  { id: FACTION.alliance, label: "Alliance" },
  { id: FACTION.horde, label: "Horde" },
];

/** "Alliance" / "Horde" for a player faction. */
export function playerFactionLabel(faction: PlayerFaction): string {
  return PLAYER_FACTION_OPTIONS.find((o) => o.id === faction)?.label ?? faction;
}
