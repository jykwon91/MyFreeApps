import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@platform/ui";
import ItemSearchBox from "@/games/wow-forever/components/compare/ItemSearchBox";
import BisListSlotRow from "@/games/wow-forever/components/gear/bisLists/BisListSlotRow";
import type { BisSlot } from "@/games/wow-forever/data/bisLists/bisSlots";
import { findClass, type WowClassId } from "@/games/wow-forever/data/classes";
import type { WeightBracket } from "@/games/wow-forever/data/weights/statWeights";
import { fitsBisSlot } from "@/games/wow-forever/lib/bisLists/bisSlotFit";
import type { ClientItem } from "@/games/wow-forever/types/clientItem";
import type { ClientItemList } from "@/games/wow-forever/types/clientItemList";
import type { GearSource } from "@/games/wow-forever/types/gearSource";
import type { ItemSearchSlotLimit } from "@/games/wow-forever/types/itemSearchSlotLimit";

interface BisListEditableSlotRowProps {
  slot: BisSlot;
  itemId: number | undefined;
  item: ClientItem | undefined;
  source: GearSource | null;
  classId: WowClassId;
  bracket: WeightBracket;
  itemList: ClientItemList;
  obtained: boolean;
  onPick: (slot: BisSlot, item: ClientItem) => void;
  onClear: (slot: BisSlot) => void;
  onToggleObtained: (slot: BisSlot) => void;
}

/** A row of the player's own list: pick or change its item (search limited to what fits), clear it, tick "I have it". */
export default function BisListEditableSlotRow({
  slot,
  itemId,
  item,
  source,
  classId,
  bracket,
  itemList,
  obtained,
  onPick,
  onClear,
  onToggleObtained,
}: BisListEditableSlotRowProps) {
  const [picking, setPicking] = useState(false);
  const pickButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const className = findClass(classId)?.name ?? classId;
  const filled = itemId !== undefined;

  const slotLimit = useMemo<ItemSearchSlotLimit>(
    () => ({
      label: `Only items a ${className} can wear in ${slot.label}.`,
      fits: (candidate) => fitsBisSlot(candidate, slot.id, classId),
    }),
    [className, slot, classId],
  );
  const searchState = useMemo(() => ({ status: "ready" as const, list: itemList }), [itemList]);

  // Back on the row's button once the search closes.
  useEffect(() => {
    if (!picking && returnFocus.current) {
      returnFocus.current = false;
      pickButton.current?.focus();
    }
  }, [picking]);

  function close() {
    returnFocus.current = true;
    setPicking(false);
  }

  return (
    <BisListSlotRow slot={slot} itemId={itemId} item={item} source={source}>
      <div className="flex flex-wrap items-center gap-2 sm:pl-[7.75rem]">
        <Button
          ref={pickButton}
          variant="secondary"
          size="sm"
          aria-expanded={picking}
          aria-label={filled ? `Change ${slot.label}` : `Pick an item for ${slot.label}`}
          onClick={() => (picking ? close() : setPicking(true))}
        >
          {filled ? "Change" : "Pick an item"}
        </Button>
        {filled ? (
          <>
            <Button variant="secondary" size="sm" aria-label={`Clear ${slot.label}`} onClick={() => onClear(slot)}>
              Clear
            </Button>
            <label className="flex items-center gap-2 text-sm min-h-[44px] px-1">
              <input type="checkbox" checked={obtained} onChange={() => onToggleObtained(slot)} className="h-5 w-5" />
              <span>
                I have it<span className="sr-only"> ({slot.label})</span>
              </span>
            </label>
          </>
        ) : null}
      </div>
      {picking ? (
        <div className="rounded-lg border bg-muted/20 p-3 space-y-3" data-testid="bis-slot-search">
          <ItemSearchBox
            state={searchState}
            classId={classId}
            bracket={bracket}
            placeholder={`Search for a ${slot.label.toLowerCase()} item`}
            slotLimit={slotLimit}
            loadError={null}
            autoFocus
            onPick={(picked) => {
              onPick(slot, picked);
              close();
            }}
          />
          <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={close}>
            Cancel
          </Button>
        </div>
      ) : null}
    </BisListSlotRow>
  );
}
