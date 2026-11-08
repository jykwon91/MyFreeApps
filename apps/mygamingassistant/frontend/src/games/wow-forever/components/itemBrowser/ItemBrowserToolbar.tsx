import { ArrowDownUp } from "lucide-react";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import {
  DEFAULT_SORT_DIRECTION,
  ITEM_SORT_OPTIONS,
  ITEM_VIEW_OPTIONS,
  SORT_DIRECTION_LABEL,
} from "@/games/wow-forever/data/itemBrowser/itemBrowserConfig";
import type { ItemBrowserQuery } from "@/games/wow-forever/types/itemBrowser/itemBrowserQuery";
import { SORT_DIRECTION } from "@/games/wow-forever/types/itemBrowser/itemSortDirection";

interface ItemBrowserToolbarProps {
  total: number;
  fuzzy: boolean;
  query: ItemBrowserQuery;
  onChange: (patch: Partial<Omit<ItemBrowserQuery, "filters">>) => void;
}

function countText(total: number): string {
  return total === 1 ? "1 item" : `${total.toLocaleString()} items`;
}

/** "1,234 items", then sort (a new sort starts in its own default direction), the direction button and List / Grid. */
export default function ItemBrowserToolbar({ total, fuzzy, query, onChange }: ItemBrowserToolbarProps) {
  const flipped = query.direction === SORT_DIRECTION.asc ? SORT_DIRECTION.desc : SORT_DIRECTION.asc;
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground" role="status" data-testid="item-browser-count">
        <span className="font-medium text-foreground">{countText(total)}</span>
        {fuzzy ? " · no exact match, showing close spellings" : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <SegmentedToggle
          label="Sort by"
          options={ITEM_SORT_OPTIONS}
          value={query.sort}
          onChange={(sort) => onChange({ sort, direction: DEFAULT_SORT_DIRECTION[sort] })}
          compact
        />
        <button
          type="button"
          onClick={() => onChange({ direction: flipped })}
          aria-label={`Sort order: ${SORT_DIRECTION_LABEL[query.sort][query.direction]}. Switch to ${SORT_DIRECTION_LABEL[query.sort][flipped]}`}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border bg-card px-3 text-sm hover:bg-muted/40"
          data-testid="item-browser-direction"
        >
          <ArrowDownUp className="h-4 w-4" aria-hidden />
          {SORT_DIRECTION_LABEL[query.sort][query.direction]}
        </button>
        <SegmentedToggle
          label="Layout"
          options={ITEM_VIEW_OPTIONS}
          value={query.view}
          onChange={(view) => onChange({ view })}
          className="sm:ml-auto"
        />
      </div>
    </div>
  );
}
