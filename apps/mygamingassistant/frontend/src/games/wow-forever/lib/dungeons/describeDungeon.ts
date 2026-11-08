import { SLOT_LABELS } from "@/games/wow-forever/data/itemSlots";
import type { BossLootItem } from "@/games/wow-forever/types/dungeons/bossLootItem";
import type { DungeonDoor } from "@/games/wow-forever/types/dungeons/dungeonDoor";
import type { DungeonEntranceZone } from "@/games/wow-forever/types/dungeons/dungeonEntranceZone";
import type { DungeonEntryRequirement } from "@/games/wow-forever/types/dungeons/dungeonEntryRequirement";

/** "45%", "33.3%", "0.7%". */
export function chanceText(chance: number): string {
  return Number.isInteger(chance) ? `${chance}%` : `${chance.toFixed(1)}%`;
}

/** "Two-Hand, Axe", "Finger"; "" when the slot isn't known. */
export function lootKindText(item: Pick<BossLootItem, "slot" | "itemType">): string {
  if (!item.slot) return item.itemType ?? "";
  return item.itemType ? `${SLOT_LABELS[item.slot]}, ${item.itemType}` : SLOT_LABELS[item.slot];
}

/** "8 bosses", "1 boss". */
export function bossCountText(count: number): string {
  return count === 1 ? "1 boss" : `${count} bosses`;
}

/** A door's name: its wing ("Armory", "Back door"), or "Entrance" for a dungeon's main door. */
export function doorLabel(door: Pick<DungeonDoor, "wing">): string {
  return door.wing || "Entrance";
}

/** "Up to 10 players". */
export function groupSizeText(maxPlayers: number): string {
  return `Up to ${maxPlayers} players`;
}

/** What getting in takes beyond the level. */
export function entryText(requirements: readonly DungeonEntryRequirement[]): string {
  return requirements.length === 0
    ? "None. Only the level."
    : "A door needs an item or a finished quest to go through.";
}

/** "Westfall", "Badlands and Searing Gorge". */
export function entranceZonesText(zones: readonly DungeonEntranceZone[]): string {
  const names = zones.map((z) => z.zoneName);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
