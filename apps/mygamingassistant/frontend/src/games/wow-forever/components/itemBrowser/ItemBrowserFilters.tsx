import { useId, useState } from "react";
import clsx from "clsx";
import { SlidersHorizontal } from "lucide-react";
import FacetChipGroup from "@/games/wow-forever/components/itemBrowser/FacetChipGroup";
import LevelRangeFields from "@/games/wow-forever/components/itemBrowser/LevelRangeFields";
import {
  ITEM_CHANGE_LABELS,
  ITEM_CHANGE_MARKS,
  ITEM_CLASS_GROUP_LABELS,
  ITEM_LEVEL_MAX,
  ITEM_LEVEL_MIN,
  REQUIRED_LEVEL_MIN,
  SLOT_FILTER_HINT,
} from "@/games/wow-forever/data/itemBrowser/itemBrowserConfig";
import { QUALITY_LABELS } from "@/games/wow-forever/data/itemQualityStyles";
import { SLOT_LABELS, type ItemSlot } from "@/games/wow-forever/data/itemSlots";
import { MAX_LEVEL } from "@/games/wow-forever/data/levelCap";
import { activeFilterCount } from "@/games/wow-forever/lib/itemBrowser/itemBrowserParams";
import type { ItemBrowserFilters as Filters } from "@/games/wow-forever/types/itemBrowser/itemBrowserFilters";
import type { ItemFacetCounts } from "@/games/wow-forever/types/itemBrowser/itemFacetCounts";
import type { ItemIndex } from "@/games/wow-forever/types/itemBrowser/itemIndex";

interface ItemBrowserFiltersProps {
  index: ItemIndex;
  filters: Filters;
  counts: ItemFacetCounts;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
}

function slotLabel(slot: ItemSlot): string {
  const hint = SLOT_FILTER_HINT[slot];
  return hint ? `${SLOT_LABELS[slot]} (${hint})` : SLOT_LABELS[slot];
}

/**
 * Quality, item class, slot, armor / weapon type, Forever changes and level
 * ranges. On a phone they fold behind one "Filters (n)" button; from `sm` up
 * they're always open.
 */
export default function ItemBrowserFilters({ index, filters, counts, onChange, onReset }: ItemBrowserFiltersProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const active = activeFilterCount(filters);
  return (
    <div className="space-y-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md border bg-card px-4 text-sm font-medium hover:bg-muted/40 sm:hidden"
        data-testid="item-filters-toggle"
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        {active > 0 ? `Filters (${active})` : "Filters"}
      </button>
      <div
        id={panelId}
        className={clsx("space-y-4 rounded-xl border bg-card p-3 sm:block sm:p-4", !open && "hidden")}
        data-testid="item-filters"
      >
        <FacetChipGroup
          legend="Quality"
          options={index.qualities}
          label={(q) => QUALITY_LABELS[q]}
          value={filters.qualities}
          counts={counts.quality}
          onChange={(qualities) => onChange({ qualities })}
          testId="item-filter-quality"
        />
        <FacetChipGroup
          legend="Item class"
          options={index.groups}
          label={(g) => ITEM_CLASS_GROUP_LABELS[g]}
          value={filters.groups}
          counts={counts.group}
          onChange={(groups) => onChange({ groups })}
          testId="item-filter-class"
        />
        <FacetChipGroup
          legend="Slot"
          options={index.slots}
          label={slotLabel}
          value={filters.slots}
          counts={counts.slot}
          onChange={(slots) => onChange({ slots })}
          testId="item-filter-slot"
        />
        <FacetChipGroup
          legend="Armor or weapon type"
          options={index.itemTypes}
          label={(t) => t}
          value={filters.types}
          counts={counts.type}
          onChange={(types) => onChange({ types })}
          testId="item-filter-type"
        />
        <FacetChipGroup
          legend="Forever"
          options={ITEM_CHANGE_MARKS}
          label={(c) => ITEM_CHANGE_LABELS[c]}
          value={filters.changes}
          counts={counts.change}
          onChange={(changes) => onChange({ changes })}
          testId="item-filter-change"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <LevelRangeFields
            legend="Required level"
            min={filters.requiredMin}
            max={filters.requiredMax}
            lowest={REQUIRED_LEVEL_MIN}
            highest={MAX_LEVEL}
            onChange={(requiredMin, requiredMax) => onChange({ requiredMin, requiredMax })}
            testId="item-filter-required"
          />
          <LevelRangeFields
            legend="Item level"
            min={filters.itemLevelMin}
            max={filters.itemLevelMax}
            lowest={ITEM_LEVEL_MIN}
            highest={ITEM_LEVEL_MAX}
            onChange={(itemLevelMin, itemLevelMax) => onChange({ itemLevelMin, itemLevelMax })}
            testId="item-filter-ilvl"
          />
        </div>
        {active > 0 ? (
          <button
            type="button"
            onClick={onReset}
            className="min-h-[44px] rounded-md border px-3 text-sm hover:bg-muted/40"
            data-testid="item-filters-reset"
          >
            Reset filters
          </button>
        ) : null}
      </div>
    </div>
  );
}
