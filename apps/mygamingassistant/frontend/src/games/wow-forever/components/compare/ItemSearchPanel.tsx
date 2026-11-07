import { useEffect, useRef, useState } from "react";
import ItemSearchBox from "@/games/wow-forever/components/compare/ItemSearchBox";
import ItemSearchLoadError from "@/games/wow-forever/components/compare/ItemSearchLoadError";
import PickedItemSummary from "@/games/wow-forever/components/compare/PickedItemSummary";
import type { WowClassId } from "@/games/wow-forever/data/classes";
import type { InputMode } from "@/games/wow-forever/data/itemInputModes";
import type { WeightBracket } from "@/games/wow-forever/data/weights/statWeights";
import { useClientItems } from "@/games/wow-forever/hooks/useClientItems";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { CompareItem } from "@/games/wow-forever/types/compareItem";

interface ItemSearchPanelProps {
  item: CompareItem;
  itemLabel: string;
  classId: WowClassId;
  bracket: WeightBracket;
  onPick: (record: ClientItem, clientBuild: string) => void;
  onEnterByHand: (query: string) => void;
  onSwitchMode: (mode: InputMode) => void;
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
  const [query, setQuery] = useState("");
  const [changing, setChanging] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const focusChange = useRef(false);
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const list = state.status === "ready" ? state.list : null;
  const picked = item.origin && list ? list.byId.get(item.origin.itemId) ?? null : null;
  const showSummary = picked !== null && !changing;

  // After a pick, focus moves to "Change item" once the summary is on screen.
  useEffect(() => {
    if (focusChange.current && showSummary) {
      changeButtonRef.current?.focus();
      focusChange.current = false;
    }
  });

  function pick(record: ClientItem, from: ClientItemList) {
    onPick(record, from.clientBuild);
    setChanging(false);
    setAnnouncement(`Selected ${record.name}`);
    focusChange.current = true;
  }

  function startChange() {
    setChanging(true);
    setAnnouncement("");
    // The search box is shown again in this render; focus it once it's there.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  // The search stays mounted (hidden) under the summary, so "Change item" brings back the last query.
  return (
    <div className="space-y-3">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {showSummary && picked ? (
        <PickedItemSummary record={picked} onChange={startChange} changeButtonRef={changeButtonRef} />
      ) : null}
      <div hidden={showSummary} className="space-y-3">
        <ItemSearchBox
          state={state}
          classId={classId}
          bracket={bracket}
          placeholder={`Search the game files for ${itemLabel}`}
          onPick={pick}
          onQueryChange={setQuery}
          inputRef={inputRef}
          loadError={
            state.status === "error" ? (
              <ItemSearchLoadError onRetry={state.retry} retrying={state.retrying} onSwitchMode={onSwitchMode} />
            ) : null
          }
        />
        <button
          type="button"
          className="text-sm underline underline-offset-2 text-muted-foreground hover:text-foreground min-h-[44px]"
          onClick={() => onEnterByHand(query.trim())}
        >
          Can't find it? Enter it by hand
        </button>
      </div>
    </div>
  );
}
