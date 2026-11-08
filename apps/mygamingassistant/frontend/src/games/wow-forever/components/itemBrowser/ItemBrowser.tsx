import { useDeferredValue, useMemo } from "react";
import ItemBrowserFilters from "@/games/wow-forever/components/itemBrowser/ItemBrowserFilters";
import ItemBrowserList from "@/games/wow-forever/components/itemBrowser/ItemBrowserList";
import ItemBrowserSearch from "@/games/wow-forever/components/itemBrowser/ItemBrowserSearch";
import ItemBrowserToolbar from "@/games/wow-forever/components/itemBrowser/ItemBrowserToolbar";
import { useItemBrowserQuery } from "@/games/wow-forever/hooks/useItemBrowserQuery";
import { filterItems } from "@/games/wow-forever/lib/itemBrowser/filterItems";
import { sortItems } from "@/games/wow-forever/lib/itemBrowser/sortItems";
import type { ItemIndex } from "@/games/wow-forever/types/itemBrowser/itemIndex";

/** Search, filters, sort and the paged list — all of it kept in the URL. */
export default function ItemBrowser({ index }: { index: ItemIndex }) {
  const { query, update, updateFilters, resetFilters, showMore } = useItemBrowserQuery(index.itemTypes);
  // Typing stays instant; the ~9,500-item filter runs a beat behind on slow phones.
  const filters = useDeferredValue(query.filters);
  const result = useMemo(() => filterItems(index.items, filters), [index.items, filters]);
  const sorted = useMemo(() => sortItems(result.items, query.sort, query.direction), [result.items, query.sort, query.direction]);
  return (
    <div className="space-y-4">
      <ItemBrowserSearch value={query.filters.query} onChange={(q) => updateFilters({ query: q })} />
      <ItemBrowserFilters index={index} filters={query.filters} counts={result.counts} onChange={updateFilters} onReset={resetFilters} />
      <ItemBrowserToolbar total={sorted.length} fuzzy={result.fuzzy} query={query} onChange={update} />
      <ItemBrowserList items={sorted} view={query.view} pages={query.pages} onShowMore={showMore} />
    </div>
  );
}
