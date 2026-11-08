import { decodeItemIndex } from "@/games/wow-forever/lib/itemBrowser/decodeItemIndex";
import type { ItemIndex } from "@/games/wow-forever/types/itemBrowser/itemIndex";
import type { ItemIndexFile } from "@/games/wow-forever/types/itemBrowser/itemIndexFile";

let cached: Promise<ItemIndex> | null = null;

/** The item browser's index, loaded once in its own chunk (a failed load is tried again next time). */
export function loadItemIndex(): Promise<ItemIndex> {
  if (!cached) {
    cached = import("@/games/wow-forever/data/items/itemIndex.json").then((file) =>
      decodeItemIndex(file.default as unknown as ItemIndexFile),
    );
    cached.catch(() => {
      cached = null;
    });
  }
  return cached;
}
