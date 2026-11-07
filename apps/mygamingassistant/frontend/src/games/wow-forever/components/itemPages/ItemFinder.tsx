import { useId, useMemo, useState } from "react";
import { useDebouncedValue } from "@platform/ui";
import LoadErrorRetry from "@/components/game/LoadErrorRetry";
import ItemSearchSkeleton from "@/games/wow-forever/components/compare/ItemSearchSkeleton";
import ItemFinderResults from "@/games/wow-forever/components/itemPages/ItemFinderResults";
import { ITEM_FINDER_RESULT_COUNT } from "@/games/wow-forever/data/itemPages/itemPageConfig";
import { ITEM_SEARCH_DEBOUNCE_MS, MIN_ITEM_QUERY_LENGTH } from "@/games/wow-forever/data/itemSearchConfig";
import { useClientItems } from "@/games/wow-forever/hooks/useClientItems";
import { searchItems } from "@/games/wow-forever/lib/itemSearch";

/** "Find an item": the compare page's name search, with each result linking to its item page. */
export default function ItemFinder({ initialQuery }: { initialQuery: string }) {
  const state = useClientItems();
  const inputId = useId();
  const [query, setQuery] = useState(initialQuery);
  const debounced = useDebouncedValue(query, ITEM_SEARCH_DEBOUNCE_MS);
  const items = useMemo(() => {
    if (state.status !== "ready" || debounced.trim().length < MIN_ITEM_QUERY_LENGTH) return [];
    return searchItems(state.list, debounced, { slot: null, usableBy: null, bracket: "level60" }).items.slice(0, ITEM_FINDER_RESULT_COUNT);
  }, [state, debounced]);

  return (
    <section className="rounded-xl border bg-card p-4 space-y-3" aria-label="Item search">
      <label htmlFor={inputId} className="block text-sm font-medium">
        Find an item
      </label>
      <input
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Item name"
        className="w-full min-h-[44px] rounded-md border bg-background px-3 text-sm"
      />
      {state.status === "loading" ? <ItemSearchSkeleton /> : null}
      {state.status === "error" ? (
        <LoadErrorRetry message="Couldn't load the item list." onRetry={state.retry} retrying={state.retrying} />
      ) : null}
      {state.status === "ready" && items.length ? <ItemFinderResults items={items} /> : null}
      {state.status === "ready" && !items.length && debounced.trim().length >= MIN_ITEM_QUERY_LENGTH ? (
        <p className="text-sm text-muted-foreground">No item with that name in WoW Forever's game files.</p>
      ) : null}
    </section>
  );
}
