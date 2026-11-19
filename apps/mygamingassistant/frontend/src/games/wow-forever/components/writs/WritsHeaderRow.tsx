import { ArrowDown, ArrowUp } from "lucide-react";
import { WRIT_ROW_GRID } from "@/games/wow-forever/components/writs/writRowStyles";
import { WRIT_SORT_LABEL } from "@/games/wow-forever/data/professions/writs/writSortOptions";
import type { WritSort } from "@/games/wow-forever/types/writs/writSort";
import type { WritSortKey } from "@/games/wow-forever/types/writs/writSortKey";

interface WritsHeaderRowProps {
  sort: WritSort;
  onSort: (key: WritSortKey) => void;
}

function ariaSort(sort: WritSort, key: WritSortKey): "ascending" | "descending" | "none" {
  if (sort.key !== key) return "none";
  return sort.direction === "asc" ? "ascending" : "descending";
}

function SortHeader({ sortKey, sort, onSort }: WritsHeaderRowProps & { sortKey: WritSortKey }) {
  const Arrow = sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <div role="columnheader" aria-sort={ariaSort(sort, sortKey)}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex min-h-[44px] items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {WRIT_SORT_LABEL[sortKey]}
        {sort.key === sortKey ? <Arrow className="h-3 w-3" aria-hidden /> : null}
      </button>
    </div>
  );
}

/** The wide grid's column titles; the sortable ones are buttons. On a phone the sort is a select instead. */
export default function WritsHeaderRow({ sort, onSort }: WritsHeaderRowProps) {
  return (
    <div role="row" className={`${WRIT_ROW_GRID} hidden border-b px-2 text-xs font-medium text-muted-foreground lg:grid`}>
      <SortHeader sortKey="name" sort={sort} onSort={onSort} />
      <SortHeader sortKey="tier" sort={sort} onSort={onSort} />
      <SortHeader sortKey="writPrice" sort={sort} onSort={onSort} />
      <div role="columnheader">Item</div>
      <SortHeader sortKey="itemPrice" sort={sort} onSort={onSort} />
      <SortHeader sortKey="total" sort={sort} onSort={onSort} />
      <div role="columnheader">Turn-in</div>
    </div>
  );
}
