import { loadAllCraftingFiles } from "@/games/wow-forever/crafting/loadCraftingData";
import { FOREVER_ITEM_SHARDS } from "@/games/wow-forever/data/itemPages/itemPageShards";
import { decodeClientItems } from "@/games/wow-forever/lib/decodeClientItems";
import { decodeItemFacts } from "@/games/wow-forever/lib/itemPages/decodeItemFacts";
import { itemPageShard, shardLoader } from "@/games/wow-forever/lib/itemPages/itemPageShard";
import { buildRecipeItemIndex } from "@/games/wow-forever/lib/itemPages/recipeItemIndex";
import type { ItemTooltipData } from "@/games/wow-forever/types/itemPages/itemTooltipData";
import type { RecipeItem } from "@/games/wow-forever/types/itemPages/recipeItem";
import type { RecipeItemTooltipData } from "@/games/wow-forever/types/itemPages/recipeItemTooltipData";

// A tooltip loads only its item's Forever shard (the item page's lighter
// half), never the full item list. A loaded shard fills the cache for every
// item in it, so later hovers on that shard are instant.
const loaded = new Map<number, ItemTooltipData | null>();
const pendingShards = new Map<number, Promise<void>>();
const loadedShards = new Set<number>();
// An item the Forever files lack may still be a recipe item (Pattern, Plans...) the profession data knows.
const recipeTooltips = new Map<number, RecipeItemTooltipData | null>();
let recipeIndex: Promise<ReadonlyMap<number, RecipeItem>> | null = null;

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

/** For an item that isn't in the Forever files: its recipe tooltip, or null when it teaches no recipe. */
export function cachedRecipeItemTooltip(itemId: number): RecipeItemTooltipData | null {
  return recipeTooltips.get(itemId) ?? null;
}

async function loadForeverItem(itemId: number): Promise<ItemTooltipData | null> {
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
  return loaded.get(itemId) ?? null;
}

async function loadRecipeItem(itemId: number): Promise<RecipeItemTooltipData | null> {
  recipeIndex ??= loadAllCraftingFiles().then(buildRecipeItemIndex);
  let index: ReadonlyMap<number, RecipeItem>;
  try {
    index = await recipeIndex;
  } catch (error) {
    recipeIndex = null;
    throw error;
  }
  const recipe = index.get(itemId);
  if (!recipe) return null;
  return { recipe, product: recipe.creates ? await loadForeverItem(recipe.creates.id) : null };
}

/**
 * Loads the item's shard once; an item the Forever files lack also loads the profession data, to see
 * whether it teaches a recipe. A failed load is forgotten so the next hover tries again.
 */
export async function loadItemTooltip(itemId: number): Promise<ItemTooltipData | null> {
  const cached = loaded.get(itemId);
  if (cached !== undefined) return cached;
  const data = await loadForeverItem(itemId);
  if (!data) recipeTooltips.set(itemId, await loadRecipeItem(itemId));
  loaded.set(itemId, data);
  return data;
}
