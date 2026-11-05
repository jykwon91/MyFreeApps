import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useDebouncedValue } from "@platform/ui";
import ItemSearchFilters from "@/games/wow-forever/components/compare/ItemSearchFilters";
import ItemSearchHint from "@/games/wow-forever/components/compare/ItemSearchHint";
import ItemSearchLoadError from "@/games/wow-forever/components/compare/ItemSearchLoadError";
import ItemSearchNoResults from "@/games/wow-forever/components/compare/ItemSearchNoResults";
import ItemSearchResults from "@/games/wow-forever/components/compare/ItemSearchResults";
import ItemSearchSkeleton from "@/games/wow-forever/components/compare/ItemSearchSkeleton";
import PickedItemSummary from "@/games/wow-forever/components/compare/PickedItemSummary";
import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import type { InputMode } from "@/games/wow-forever/data/itemInputModes";
import {
  EXAMPLE_ITEM_IDS,
  FIRST_RESULT_COUNT,
  ITEM_SEARCH_DEBOUNCE_MS,
  MIN_ITEM_QUERY_LENGTH,
  MORE_RESULTS_STEP,
} from "@/games/wow-forever/data/itemSearchConfig";
import type { ItemSlot } from "@/games/wow-forever/data/itemSlots";
import type { WeightBracket } from "@/games/wow-forever/data/weights/statWeights";
import { useClientItems } from "@/games/wow-forever/hooks/useClientItems";
import { ambiguousItemIds, exampleItemNames, normalizeItemName, searchItems } from "@/games/wow-forever/lib/itemSearch";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { CompareItem } from "@/games/wow-forever/types/compareItem";
import type { ItemSearchResult } from "@/games/wow-forever/types/itemSearchResult";

interface ItemSearchPanelProps {
  item: CompareItem;
  itemLabel: string;
  classId: WowClassId;
  bracket: WeightBracket;
  onPick: (record: ClientItem, clientBuild: string) => void;
  onEnterByHand: (query: string) => void;
  onSwitchMode: (mode: InputMode) => void;
}

const NO_RESULT: ItemSearchResult = { items: [], fuzzy: false, hiddenByClass: 0 };

function countText(result: ItemSearchResult): string {
  const n = result.items.length;
  const items = n === 1 ? "1 item" : `${n} items`;
  return result.fuzzy ? `Closest matches: ${items}` : `${items} match`;
}

/** "Search by name": find an item in the Forever game files and fill the card from it. */
export default function ItemSearchPanel({
  item,
  itemLabel,
  classId,
  bracket,
  onPick,
  onEnterByHand,
  onSwitchMode,
}: ItemSearchPanelProps) {
  const state = useClientItems();
  const baseId = useId();
  const listId = `${baseId}-results`;
  const [query, setQuery] = useState("");
  const [slot, setSlot] = useState<ItemSlot | null>(null);
  const [classOnly, setClassOnly] = useState(true);
  const [shownCount, setShownCount] = useState(FIRST_RESULT_COUNT);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [changing, setChanging] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const focusChange = useRef(false);
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebouncedValue(query, ITEM_SEARCH_DEBOUNCE_MS);
  const className = findClass(classId)?.name ?? classId;

  const searchable = normalizeItemName(debounced).length >= MIN_ITEM_QUERY_LENGTH;
  const list = state.status === "ready" ? state.list : null;
  const result = useMemo(
    () => (list && searchable ? searchItems(list, debounced, { slot, usableBy: classOnly ? classId : null, bracket }) : NO_RESULT),
    [list, searchable, debounced, slot, classOnly, classId, bracket],
  );
  const ambiguous = useMemo(() => ambiguousItemIds(result.items), [result]);
  // When the filters leave nothing, say how many they're hiding.
  const unfilteredCount = useMemo(() => {
    if (!list || !searchable || result.items.length > 0 || (slot === null && !classOnly)) return 0;
    return searchItems(list, debounced, { slot: null, usableBy: null, bracket }).items.length;
  }, [list, searchable, result, slot, classOnly, debounced, bracket]);

  // A new search starts back at the first page with nothing highlighted.
  const searchKey = `${debounced}|${slot}|${classOnly}|${classId}|${bracket}`;
  const [lastSearchKey, setLastSearchKey] = useState(searchKey);
  if (searchKey !== lastSearchKey) {
    setLastSearchKey(searchKey);
    setShownCount(FIRST_RESULT_COUNT);
    setActiveIndex(-1);
  }

  const shown = result.items.slice(0, shownCount);
  const picked = item.origin && list ? list.byId.get(item.origin.itemId) ?? null : null;
  const showSummary = picked !== null && !changing;

  // After a pick, focus moves to "Change item" once the summary is on screen.
  useEffect(() => {
    if (focusChange.current && showSummary) {
      changeButtonRef.current?.focus();
      focusChange.current = false;
    }
  });

  function pick(record: ClientItem) {
    if (!list) return;
    onPick(record, list.clientBuild);
    setChanging(false);
    setAnnouncement(`Selected ${record.name}`);
    focusChange.current = true;
  }

  function startChange() {
    setChanging(true);
    setAnnouncement("");
    // The search box replaces the summary in this render; focus it once it's there.
    requestAnimationFrame(() => inputRef.current?.focus());
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
      else if (query) setQuery("");
    }
  }

  const optionId = (record: ClientItem) => `${baseId}-option-${record.id}`;
  const active = activeIndex >= 0 ? shown[activeIndex] : undefined;
  const expanded = shown.length > 0;

  let status = "";
  if (state.status === "loading") status = "Loading item list…";
  else if (state.status === "ready" && searchable) status = countText(result);

  return (
    <div className="space-y-3">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {showSummary && picked ? (
        <PickedItemSummary record={picked} onChange={startChange} changeButtonRef={changeButtonRef} />
      ) : (
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
              value={query}
              placeholder={`Search the game files for ${itemLabel}`}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              className="border rounded-md px-3 py-2 text-base min-h-[44px] w-full bg-card"
            />
          </label>
          <ItemSearchFilters
            idPrefix={baseId}
            slot={slot}
            onSlotChange={setSlot}
            className={className}
            classOnly={classOnly}
            onClassOnlyChange={setClassOnly}
          />
          <p id={`${baseId}-status`} className="text-xs text-muted-foreground" aria-live="polite">
            {status}
          </p>
          {state.status === "loading" ? <ItemSearchSkeleton /> : null}
          {state.status === "error" ? (
            <ItemSearchLoadError onRetry={state.retry} retrying={state.retrying} onSwitchMode={onSwitchMode} />
          ) : null}
          {list && !searchable ? (
            <ItemSearchHint tooShort={query.trim() !== ""} exampleNames={exampleItemNames(list, EXAMPLE_ITEM_IDS)} />
          ) : null}
          {list && searchable && classOnly && result.hiddenByClass > 0 ? (
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
          <button
            type="button"
            className="text-sm underline underline-offset-2 text-muted-foreground hover:text-foreground min-h-[44px]"
            onClick={() => onEnterByHand(query.trim())}
          >
            Can't find it? Enter it by hand
          </button>
        </>
      )}
    </div>
  );
}
