import { FOREVER_ITEM_SHARDS } from "@/games/wow-forever/data/itemPages/itemPageShards";
import { decodeClientItems } from "@/games/wow-forever/lib/decodeClientItems";
import { decodeItemFacts } from "@/games/wow-forever/lib/itemPages/decodeItemFacts";
import { itemPageShard, shardLoader } from "@/games/wow-forever/lib/itemPages/itemPageShard";
import type { ItemTooltipData } from "@/games/wow-forever/types/itemPages/itemTooltipData";

// A tooltip loads only its item's Forever shard (the item page's lighter
// half), never the full item list. A loaded shard fills the cache for every
// item in it, so later hovers on that shard are instant.
const loaded = new Map<number, ItemTooltipData | null>();
const pendingShards = new Map<number, Promise<void>>();
const loadedShards = new Set<number>();

async function loadShard(itemId: number): Promise<void> {
  const forever = shardLoader(FOREVER_ITEM_SHARDS, itemId);
  if (!forever) throw new Error(`Item data for ${itemId} is missing from the build`);
  const [file, suffix] = await Promise.all([forever(), import("@/games/wow-forever/data/items/classic/randomSuffixItems.json")]);
  for (const item of decodeClientItems(file, suffix.default.ids).items) {
    loaded.set(item.id, { item, facts: decodeItemFacts(file.facts[String(item.id)]) });
  }
  loadedShards.add(itemPageShard(itemId));
}

/** A tooltip's data if it's loaded: undefined = not yet, null = not in the Forever files. */
export function cachedItemTooltip(itemId: number): ItemTooltipData | null | undefined {
  return loaded.get(itemId);
}

/** Loads the item's shard once; a failed load is forgotten so the next hover tries again. */
export async function loadItemTooltip(itemId: number): Promise<ItemTooltipData | null> {
  const cached = loaded.get(itemId);
  if (cached !== undefined) return cached;
  const shard = itemPageShard(itemId);
  if (!loadedShards.has(shard)) {
    let pending = pendingShards.get(shard);
    if (!pending) {
      pending = loadShard(itemId).finally(() => pendingShards.delete(shard));
      pendingShards.set(shard, pending);
    }
    await pending;
  }
  const data = loaded.get(itemId) ?? null;
  loaded.set(itemId, data);
  return data;
}
