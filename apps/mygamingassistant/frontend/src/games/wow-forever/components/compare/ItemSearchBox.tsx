import { useId, useMemo, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { useDebouncedValue } from "@platform/ui";
import ItemSearchFilters from "@/games/wow-forever/components/compare/ItemSearchFilters";
import ItemSearchHint from "@/games/wow-forever/components/compare/ItemSearchHint";
import ItemSearchNoResults from "@/games/wow-forever/components/compare/ItemSearchNoResults";
import ItemSearchResults from "@/games/wow-forever/components/compare/ItemSearchResults";
import ItemSearchSkeleton from "@/games/wow-forever/components/compare/ItemSearchSkeleton";
import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import {
  EXAMPLE_ITEM_IDS,
  FIRST_RESULT_COUNT,
  ITEM_SEARCH_DEBOUNCE_MS,
  MIN_ITEM_QUERY_LENGTH,
  MORE_RESULTS_STEP,
} from "@/games/wow-forever/data/itemSearchConfig";
import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import type { WeightBracket } from "@/games/wow-forever/data/weights/statWeights";
import type { ClientItemsState } from "@/games/wow-forever/hooks/useClientItems";
import { ambiguousItemIds, exampleItemNames, normalizeItemName, searchItems } from "@/games/wow-forever/lib/itemSearch";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { ItemSearchFilters as SearchFilters } from "@/games/wow-forever/types/itemSearchFilters";
import type { ItemSearchResult } from "@/games/wow-forever/types/itemSearchResult";
import type { ItemSearchSlotLimit } from "@/games/wow-forever/types/itemSearchSlotLimit";

interface ItemSearchBoxProps {
  state: ClientItemsState;
  classId: WowClassId;
  bracket: WeightBracket;
  placeholder: string;
  onPick: (record: ClientItem, list: ClientItemList) => void;
  /** Shown in place of results when the item list didn't load. */
  loadError: ReactNode;
  /** Search only items that fit one slot; the slot and class filters are then fixed and hidden. */
  slotLimit?: ItemSearchSlotLimit;
  /** Told what's typed, for a caller that acts on the query (Compare's "Enter it by hand"). */
  onQueryChange?: (query: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  autoFocus?: boolean;
}

const NO_RESULT: ItemSearchResult = { items: [], fuzzy: false, hiddenByClass: 0 };

function countText(result: ItemSearchResult): string {
  const n = result.items.length;
  const items = n === 1 ? "1 item" : `${n} items`;
  return result.fuzzy ? `Closest matches: ${items}` : `${items} match`;
}

/** The item-name search over the Forever game files: a combobox, its filters and the results listbox. */
export default function ItemSearchBox({
  state,
  classId,
  bracket,
  placeholder,
  onPick,
  loadError,
  slotLimit,
  onQueryChange,
  inputRef,
  autoFocus = false,
}: ItemSearchBoxProps) {
  const baseId = useId();
  const listId = `${baseId}-results`;
  const [query, setQuery] = useState("");
  const [slot, setSlot] = useState<ItemSlot | null>(null);
  const [classOnly, setClassOnly] = useState(true);
  const [shownCount, setShownCount] = useState(FIRST_RESULT_COUNT);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounced = useDebouncedValue(query, ITEM_SEARCH_DEBOUNCE_MS);
  const className = findClass(classId)?.name ?? classId;

  const searchable = normalizeItemName(debounced).length >= MIN_ITEM_QUERY_LENGTH;
  const list = state.status === "ready" ? state.list : null;
  const filters = useMemo<SearchFilters>(
    () =>
      slotLimit
        ? { slot: null, usableBy: classId, bracket, fits: slotLimit.fits }
        : { slot, usableBy: classOnly ? classId : null, bracket },
    [slotLimit, slot, classOnly, classId, bracket],
  );
  const result = useMemo(
    () => (list && searchable ? searchItems(list, debounced, filters) : NO_RESULT),
    [list, searchable, debounced, filters],
  );
  const ambiguous = useMemo(() => ambiguousItemIds(result.items), [result]);
  // When the filters leave nothing, say how many they're hiding (a slot limit is never lifted).
  const unfilteredCount = useMemo(() => {
    if (slotLimit || !list || !searchable || result.items.length > 0 || (slot === null && !classOnly)) return 0;
    return searchItems(list, debounced, { slot: null, usableBy: null, bracket }).items.length;
  }, [slotLimit, list, searchable, result, slot, classOnly, debounced, bracket]);

  // A new search starts back at the first page with nothing highlighted.
  const searchKey = `${debounced}|${slot}|${classOnly}|${classId}|${bracket}|${slotLimit?.label ?? ""}`;
  const [lastSearchKey, setLastSearchKey] = useState(searchKey);
  if (searchKey !== lastSearchKey) {
    setLastSearchKey(searchKey);
    setShownCount(FIRST_RESULT_COUNT);
    setActiveIndex(-1);
  }

  const shown = result.items.slice(0, shownCount);

  function changeQuery(next: string) {
    setQuery(next);
    onQueryChange?.(next);
  }

  function pick(record: ClientItem) {
    if (list) onPick(record, list);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" && shown.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, shown.length - 1));
    } else if (e.key === "ArrowUp" && shown.length > 0) {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0 && shown[activeIndex]) {
      e.preventDefault();
      pick(shown[activeIndex]);
    } else if (e.key === "Escape") {
      if (activeIndex >= 0) setActiveIndex(-1);
      else if (query) changeQuery("");
    }
  }

  const optionId = (record: ClientItem) => `${baseId}-option-${record.id}`;
  const active = activeIndex >= 0 ? shown[activeIndex] : undefined;
  const expanded = shown.length > 0;

  let status = "";
  if (state.status === "loading") status = "Loading item list…";
  else if (state.status === "ready" && searchable) status = countText(result);

  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Item name</span>
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={active ? optionId(active) : undefined}
          aria-describedby={`${baseId}-status`}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(e) => changeQuery(e.target.value)}
          onKeyDown={onKeyDown}
          className="border rounded-md px-3 py-2 text-base min-h-[44px] w-full bg-card"
        />
      </label>
      {slotLimit ? (
        <p className="text-xs text-muted-foreground">{slotLimit.label}</p>
      ) : (
        <ItemSearchFilters
          idPrefix={baseId}
          slot={slot}
          onSlotChange={setSlot}
          className={className}
          classOnly={classOnly}
          onClassOnlyChange={setClassOnly}
        />
      )}
      <p id={`${baseId}-status`} className="text-xs text-muted-foreground" aria-live="polite">
        {status}
      </p>
      {state.status === "loading" ? <ItemSearchSkeleton /> : null}
      {state.status === "error" ? loadError : null}
      {list && !searchable ? (
        <ItemSearchHint tooShort={query.trim() !== ""} exampleNames={exampleItemNames(list, EXAMPLE_ITEM_IDS)} />
      ) : null}
      {list && searchable && !slotLimit && classOnly && result.hiddenByClass > 0 ? (
        <p className="text-xs text-muted-foreground">
          {result.hiddenByClass} hidden because {className} can't use them.{" "}
          <button type="button" className="underline underline-offset-2" onClick={() => setClassOnly(false)}>
            Show them
          </button>
        </p>
      ) : null}
      {list && searchable && result.items.length === 0 ? (
        <ItemSearchNoResults
          query={debounced.trim()}
          hiddenCount={unfilteredCount}
          filtersActive={unfilteredCount > 0}
          onClearFilters={() => {
            setSlot(null);
            setClassOnly(false);
          }}
        />
      ) : null}
      {expanded ? (
        <ItemSearchResults
          listId={listId}
          optionId={optionId}
          shown={shown}
          total={result.items.length}
          activeIndex={activeIndex}
          ambiguousIds={ambiguous}
          onPick={pick}
          onShowMore={() => setShownCount((n) => n + MORE_RESULTS_STEP)}
        />
      ) : null}
    </>
  );
}
