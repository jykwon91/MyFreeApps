import { useState } from "react";
import clsx from "clsx";
import { Select } from "@platform/ui";
import { isItemSlot, ITEM_SLOTS, SLOT_LABELS, type ItemSlot } from "@/games/wow-forever/data/itemSlots";

interface ItemSearchFiltersProps {
  idPrefix: string;
  slot: ItemSlot | null;
  onSlotChange: (slot: ItemSlot | null) => void;
  className: string;
  classOnly: boolean;
  onClassOnlyChange: (on: boolean) => void;
}

const ANY_SLOT = "";
// "Other" and the cosmetic slots never hold an item from the list.
const FILTER_SLOTS = ITEM_SLOTS.filter((s) => s !== "other" && s !== "shirt" && s !== "tabard");

/** Slot + class filters. Always shown on wider screens; behind "Filters (n)" on phones. */
export default function ItemSearchFilters({
  idPrefix,
  slot,
  onSlotChange,
  className,
  classOnly,
  onClassOnlyChange,
}: ItemSearchFiltersProps) {
  const [open, setOpen] = useState(false);
  const active = (slot !== null ? 1 : 0) + (classOnly ? 1 : 0);
  const panelId = `${idPrefix}-filters`;
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="sm:hidden text-sm font-medium rounded-md border px-3 min-h-[44px]"
      >
        Filters ({active})
      </button>
      <div id={panelId} className={clsx(open ? "flex" : "hidden", "sm:flex flex-wrap items-end gap-3")}>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Search in slot</span>
          <Select
            value={slot ?? ANY_SLOT}
            onChange={(e) => onSlotChange(isItemSlot(e.target.value) ? e.target.value : null)}
            className="min-h-[44px] bg-card"
          >
            <option value={ANY_SLOT}>Any slot</option>
            {FILTER_SLOTS.map((s) => (
              <option key={s} value={s}>
                {SLOT_LABELS[s]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex items-center gap-2 text-sm min-h-[44px]">
          <input
            type="checkbox"
            checked={classOnly}
            onChange={(e) => onClassOnlyChange(e.target.checked)}
            className="h-5 w-5"
          />
          Hide items restricted to classes other than {className}
        </label>
      </div>
    </div>
  );
}
