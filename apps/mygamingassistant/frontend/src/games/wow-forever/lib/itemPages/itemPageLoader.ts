import { CLASSIC_ITEM_SHARDS, FOREVER_ITEM_SHARDS } from "@/games/wow-forever/data/itemPages/itemPageShards";
import { decodeClientItems } from "@/games/wow-forever/lib/decodeClientItems";
import { decodeClassicItem } from "@/games/wow-forever/lib/itemPages/decodeClassicItem";
import { decodeItemFacts } from "@/games/wow-forever/lib/itemPages/decodeItemFacts";
import { shardLoader } from "@/games/wow-forever/lib/itemPages/itemPageShard";
import type { ItemPageResult } from "@/games/wow-forever/types/itemPages/itemPageResult";
import { ITEM_PAGE_RESULT } from "@/games/wow-forever/types/itemPages/itemPageResultKind";

async function unseenName(itemId: number): Promise<string | null> {
  const file = await import("@/games/wow-forever/data/items/pages/classic/unseen.json");
  const row = file.default.items.find((r) => r[0] === itemId);
  return row ? String(row[1]) : null;
}

/** An item page's data: its Forever shard and its Classic shard; an id in neither is "unseen" or unknown. */
export async function loadItemPage(itemId: number | null): Promise<ItemPageResult> {
  if (itemId === null) return { kind: ITEM_PAGE_RESULT.unknown, id: null };
  const forever = shardLoader(FOREVER_ITEM_SHARDS, itemId);
  const classic = shardLoader(CLASSIC_ITEM_SHARDS, itemId);
  if (!forever || !classic) throw new Error(`Item page data for ${itemId} is missing from the build`);
  const [foreverFile, classicFile, suffix] = await Promise.all([
    forever(),
    classic(),
    import("@/games/wow-forever/data/items/classic/randomSuffixItems.json"),
  ]);
  const item = decodeClientItems(foreverFile, suffix.default.ids).byId.get(itemId);
  if (!item) {
    const name = await unseenName(itemId);
    return name === null ? { kind: ITEM_PAGE_RESULT.unknown, id: itemId } : { kind: ITEM_PAGE_RESULT.unseen, id: itemId, name };
  }
  return {
    kind: ITEM_PAGE_RESULT.found,
    page: {
      item,
      facts: decodeItemFacts(foreverFile.facts[String(itemId)]),
      sources: decodeClassicItem(classicFile, itemId),
      clientBuild: foreverFile.clientBuild,
    },
  };
}
