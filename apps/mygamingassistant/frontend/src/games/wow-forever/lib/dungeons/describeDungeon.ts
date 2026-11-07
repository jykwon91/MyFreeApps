import { SLOT_LABELS } from "@/games/wow-forever/data/itemSlots";
import type { BossLootItem } from "@/games/wow-forever/types/dungeons/bossLootItem";
import type { DungeonEntranceZone } from "@/games/wow-forever/types/dungeons/dungeonEntranceZone";

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

/** The named doors in a zone: "Doors: Armory · Cathedral", "Door: Back door"; "" when the zone has one unnamed door. */
export function entranceDoorsText(zone: DungeonEntranceZone): string {
  if (zone.wings.length === 0) return "";
  return `${zone.wings.length === 1 ? "Door" : "Doors"}: ${zone.wings.join(" · ")}`;
}

/** "Westfall", "Badlands and Searing Gorge". */
export function entranceZonesText(zones: readonly DungeonEntranceZone[]): string {
  const names = zones.map((z) => z.zoneName);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
