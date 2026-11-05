import { WOW_CLASSES, type WowClassId } from "@/games/wow-forever/data/classes";
import { isItemQuality, isItemSlot } from "@/games/wow-forever/data/itemSlots";
import { isStatKey, type StatValues } from "@/games/wow-forever/data/statKeys";
import { nameWords, normalizeItemName } from "@/games/wow-forever/lib/itemSearch";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { ClientItemFile } from "@/games/wow-forever/types/clientItemFile";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { WeaponStats } from "@/games/wow-forever/types/compareItem";

const COLUMNS = [
  "id", "name", "quality", "slot", "itemType", "itemLevel", "requiredLevel",
  "armor", "weapon", "stats", "classes", "damageUnknown", "otherEffects",
] as const;

type Column = (typeof COLUMNS)[number];

const CLASS_IDS: ReadonlySet<string> = new Set(WOW_CLASSES.map((c) => c.id));

function isClassId(value: unknown): value is WowClassId {
  return typeof value === "string" && CLASS_IDS.has(value);
}

function num(value: unknown): number {
  if (typeof value !== "number") throw new Error(`Item list: expected a number, got ${String(value)}`);
  return value;
}

function numOrNull(value: unknown): number | null {
  return value === null ? null : num(value);
}

function weaponOf(value: unknown): WeaponStats | null {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length !== 3) throw new Error("Item list: bad weapon column");
  return { minDamage: num(value[0]), maxDamage: num(value[1]), speed: num(value[2]) };
}

function statsOf(value: unknown): StatValues {
  const stats: StatValues = {};
  for (const [key, amount] of Object.entries(value as Record<string, unknown>)) {
    if (isStatKey(key)) stats[key] = num(amount);
  }
  return stats;
}

function classesOf(value: unknown): readonly WowClassId[] | null {
  if (value === null) return null;
  if (!Array.isArray(value)) throw new Error("Item list: bad classes column");
  return value.filter(isClassId);
}

/**
 * Turn the generated item file (+ the random-suffix id list) into items and
 * the search index. Throws on a column the page doesn't know, so a generator
 * change can't silently feed it wrong numbers.
 */
export function decodeClientItems(file: ClientItemFile, randomSuffixIds: readonly number[]): ClientItemList {
  const at = {} as Record<Column, number>;
  for (const column of COLUMNS) {
    const index = file.columns.indexOf(column);
    if (index < 0) throw new Error(`Item list is missing the "${column}" column`);
    at[column] = index;
  }
  const suffix = new Set(randomSuffixIds);
  const items: ClientItem[] = [];
  for (const row of file.items) {
    const quality = row[at.quality];
    const slot = row[at.slot];
    if (typeof quality !== "string" || !isItemQuality(quality) || typeof slot !== "string" || !isItemSlot(slot)) {
      throw new Error(`Item list: bad quality or slot on item ${String(row[at.id])}`);
    }
    const id = num(row[at.id]);
    const itemType = row[at.itemType];
    items.push({
      id,
      name: String(row[at.name]),
      quality,
      slot,
      itemType: typeof itemType === "string" ? itemType : null,
      itemLevel: num(row[at.itemLevel]),
      requiredLevel: num(row[at.requiredLevel]),
      armor: numOrNull(row[at.armor]),
      weapon: weaponOf(row[at.weapon]),
      stats: statsOf(row[at.stats]),
      classes: classesOf(row[at.classes]),
      damageUnknown: row[at.damageUnknown] === 1,
      otherEffects: num(row[at.otherEffects]),
      randomSuffix: suffix.has(id),
    });
  }
  const searchNames = items.map((i) => normalizeItemName(i.name));
  return {
    items,
    byId: new Map(items.map((i) => [i.id, i])),
    searchNames,
    searchWords: searchNames.map(nameWords),
    clientBuild: file.clientBuild,
    attribution: file.attribution,
  };
}
