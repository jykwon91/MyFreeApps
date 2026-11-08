import ItemBrowserCard from "@/games/wow-forever/components/itemBrowser/ItemBrowserCard";
import ItemBrowserRow from "@/games/wow-forever/components/itemBrowser/ItemBrowserRow";
import EmptyStateNote from "@/games/wow-forever/components/shared/EmptyStateNote";
import { ITEM_BROWSER_PAGE_SIZE, ITEM_BROWSER_TEXT } from "@/games/wow-forever/data/itemBrowser/itemBrowserConfig";
import { ITEM_BROWSER_VIEW, type ItemBrowserView } from "@/games/wow-forever/types/itemBrowser/itemBrowserView";
import type { ItemIndexEntry } from "@/games/wow-forever/types/itemBrowser/itemIndexEntry";

interface ItemBrowserListProps {
  items: readonly ItemIndexEntry[];
  view: ItemBrowserView;
  /** "Show more" pages opened so far (from the URL). */
  pages: number;
  onShowMore: () => void;
}

/**
 * The matching items, `ITEM_BROWSER_PAGE_SIZE` at a time, as rows or a grid.
 * How many pages are open lives in the URL, so Back from an item page keeps the spot.
 */
export default function ItemBrowserList({ items, view, pages, onShowMore }: ItemBrowserListProps) {
  const shown = pages * ITEM_BROWSER_PAGE_SIZE;
  if (items.length === 0) return <EmptyStateNote message={ITEM_BROWSER_TEXT.empty} />;
  const page = items.slice(0, shown);
  return (
    <div className="space-y-3">
      {view === ITEM_BROWSER_VIEW.grid ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="item-browser-grid">
          {page.map((item) => (
            <ItemBrowserCard key={item.id} item={item} />
          ))}
        </ul>
      ) : (
        <ul className="divide-y rounded-xl border bg-card" data-testid="item-browser-list">
          {page.map((item) => (
            <ItemBrowserRow key={item.id} item={item} />
          ))}
        </ul>
      )}
      {items.length > shown ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onShowMore}
            className="min-h-[44px] w-full rounded-md border bg-card px-4 text-sm font-medium hover:bg-muted sm:w-auto"
            data-testid="item-browser-more"
          >
            Show {Math.min(ITEM_BROWSER_PAGE_SIZE, items.length - shown)} more
          </button>
          <span className="text-xs text-muted-foreground">
            Showing {shown.toLocaleString()} of {items.length.toLocaleString()}
          </span>
        </div>
      ) : null}
    </div>
  );
}
