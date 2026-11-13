import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import ItemBrowser from "@/games/wow-forever/components/itemBrowser/ItemBrowser";
import ItemBrowserNote from "@/games/wow-forever/components/itemBrowser/ItemBrowserNote";
import ItemBrowserSkeleton from "@/games/wow-forever/components/itemBrowser/ItemBrowserSkeleton";
import WowPageHeader from "@/games/wow-forever/components/shared/WowPageHeader";
import { ITEM_BROWSER_TEXT, ITEM_INDEX_STATUS } from "@/games/wow-forever/data/itemBrowser/itemBrowserConfig";
import { useDocumentTitle } from "@/games/wow-forever/hooks/useDocumentTitle";
import { useItemIndex } from "@/games/wow-forever/hooks/useItemIndex";

/** /wow-forever/items — every item the Forever game files have shown so far: search, filter, sort, open one. */
export default function WowItemsPage() {
  useDocumentTitle("Items · WoW Forever");
  const state = useItemIndex();
  return (
    <div className="p-4 sm:p-8 space-y-4 max-w-5xl">
      <WowPageHeader
        title="Items"
        subtitle="Search and filter the gear the Forever game files have shown so far, then open an item to see its tooltip and how to get it."
        backTo="/wow-forever"
        backLabel="Back to WoW Forever"
      />
      <ItemBrowserNote clientBuild={state.status === ITEM_INDEX_STATUS.ready ? state.data.clientBuild : null} />
      {state.status === ITEM_INDEX_STATUS.error ? (
        <LoadErrorRetry message={ITEM_BROWSER_TEXT.loadError} onRetry={state.retry} retrying={false} />
      ) : null}
      {state.status === ITEM_INDEX_STATUS.ready ? <ItemBrowser index={state.data} /> : null}
      {state.status === ITEM_INDEX_STATUS.loading ? <ItemBrowserSkeleton /> : null}
    </div>
  );
}
