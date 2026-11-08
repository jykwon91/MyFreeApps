import { useEffect, useState } from "react";
import { ITEM_INDEX_STATUS } from "@/games/wow-forever/data/itemBrowser/itemBrowserConfig";
import { loadItemIndex } from "@/games/wow-forever/lib/itemBrowser/loadItemIndex";
import type { ItemIndex } from "@/games/wow-forever/types/itemBrowser/itemIndex";
import type { ItemIndexState } from "@/games/wow-forever/types/itemBrowser/itemIndexState";

// The browser remembers a module import that failed and won't fetch it again, so a retry reloads the page.
const reloadPage = () => window.location.reload();

/** The item browser's index, loaded once (its own chunk). */
export function useItemIndex(): ItemIndexState {
  const [data, setData] = useState<ItemIndex | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    loadItemIndex().then(
      (loaded) => live && setData(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  if (data) return { status: ITEM_INDEX_STATUS.ready, data };
  if (failed) return { status: ITEM_INDEX_STATUS.error, retry: reloadPage };
  return { status: ITEM_INDEX_STATUS.loading };
}
