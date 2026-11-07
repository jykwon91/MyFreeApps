import { ITEM_PAGE_SHARD_COUNT } from "@/games/wow-forever/data/itemPages/itemPageConfig";

/** The shard an item's page data is in. */
export function itemPageShard(itemId: number): number {
  return itemId % ITEM_PAGE_SHARD_COUNT;
}

/** "05" — the shard's file name. */
export function shardFileName(itemId: number): string {
  return String(itemPageShard(itemId)).padStart(2, "0");
}

/** The loader in a glob whose file is that shard, or null. */
export function shardLoader<T>(glob: Readonly<Record<string, () => Promise<T>>>, itemId: number): (() => Promise<T>) | null {
  const suffix = `/${shardFileName(itemId)}.json`;
  const key = Object.keys(glob).find((k) => k.endsWith(suffix));
  return key === undefined ? null : glob[key];
}
