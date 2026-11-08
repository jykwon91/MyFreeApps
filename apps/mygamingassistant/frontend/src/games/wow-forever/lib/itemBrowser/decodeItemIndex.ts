import { ARMOR_TYPE_ORDER, ITEM_CLASS_GROUPS } from "@/games/wow-forever/data/itemBrowser/itemBrowserConfig";
import { ITEM_QUALITIES, ITEM_SLOTS, isItemQuality, isItemSlot } from "@/games/wow-forever/data/itemSlots";
import { itemClassGroup } from "@/games/wow-forever/lib/itemBrowser/itemClassGroup";
import { nameWords, normalizeItemName } from "@/games/wow-forever/lib/itemSearch";
import { ITEM_CHANGE, type ItemChangeKind } from "@/games/wow-forever/types/itemBrowser/itemChangeKind";
import type { ItemIndex } from "@/games/wow-forever/types/itemBrowser/itemIndex";
import type { ItemIndexEntry } from "@/games/wow-forever/types/itemBrowser/itemIndexEntry";
import type { ItemIndexFile } from "@/games/wow-forever/types/itemBrowser/itemIndexFile";

const CHANGE_KINDS: readonly string[] = Object.values(ITEM_CHANGE);

function isChangeKind(value: string | undefined): value is ItemChangeKind {
  return value !== undefined && CHANGE_KINDS.includes(value);
}

/** Armor types in `ARMOR_TYPE_ORDER` first, then the rest (weapon types) A–Z. */
export function orderItemTypes(types: readonly string[]): string[] {
  const armor = ARMOR_TYPE_ORDER.filter((t) => types.includes(t));
  const rest = types.filter((t) => !ARMOR_TYPE_ORDER.includes(t)).sort((a, b) => a.localeCompare(b));
  return [...armor, ...rest];
}

function column(file: ItemIndexFile, name: string): number {
  const at = file.columns.indexOf(name);
  if (at < 0) throw new Error(`itemIndex.json has no "${name}" column`);
  return at;
}

/**
 * The index file as typed entries. Columns are looked up by name; a row whose
 * quality, slot or change isn't one we know is dropped rather than guessed.
 */
export function decodeItemIndex(file: ItemIndexFile): ItemIndex {
  const at = {
    id: column(file, "id"),
    name: column(file, "name"),
    quality: column(file, "quality"),
    slot: column(file, "slot"),
    itemType: column(file, "itemType"),
    itemLevel: column(file, "itemLevel"),
    requiredLevel: column(file, "requiredLevel"),
    change: column(file, "change"),
  };
  const items: ItemIndexEntry[] = [];
  for (const row of file.items) {
    const quality = file.qualities[Number(row[at.quality])];
    const slot = file.slots[Number(row[at.slot])];
    const change = file.changeKinds[Number(row[at.change])];
    if (quality === undefined || !isItemQuality(quality) || slot === undefined || !isItemSlot(slot) || !isChangeKind(change)) {
      continue;
    }
    const itemType = file.itemTypes[Number(row[at.itemType])] ?? null;
    const name = String(row[at.name]);
    items.push({
      id: Number(row[at.id]),
      name,
      quality,
      slot,
      itemType,
      itemLevel: Number(row[at.itemLevel]),
      requiredLevel: Number(row[at.requiredLevel]),
      change,
      group: itemClassGroup(slot, itemType),
      searchWords: nameWords(normalizeItemName(name)),
    });
  }
  const has = <T,>(values: readonly T[], of: (item: ItemIndexEntry) => T): T[] => {
    const seen = new Set(items.map(of));
    return values.filter((v) => seen.has(v));
  };
  const usedTypes = new Set(items.map((i) => i.itemType));
  return {
    clientBuild: file.clientBuild,
    items,
    qualities: has(ITEM_QUALITIES, (i) => i.quality),
    groups: has(ITEM_CLASS_GROUPS, (i) => i.group),
    slots: has(ITEM_SLOTS, (i) => i.slot),
    itemTypes: orderItemTypes(file.itemTypes.filter((t) => usedTypes.has(t))),
  };
}
