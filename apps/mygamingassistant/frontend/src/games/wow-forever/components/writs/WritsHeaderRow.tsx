import SortHeader from "@/games/wow-forever/components/professionTiers/SortHeader";
import { WRIT_ROW_GRID } from "@/games/wow-forever/components/writs/writRowStyles";
import { WRIT_SORT_LABEL } from "@/games/wow-forever/data/professions/writs/writSortOptions";
import type { WritSort } from "@/games/wow-forever/types/writs/writSort";
import type { WritSortKey } from "@/games/wow-forever/types/writs/writSortKey";

interface WritsHeaderRowProps {
  sort: WritSort;
  onSort: (key: WritSortKey) => void;
}

/** The wide grid's column titles; the sortable ones are buttons. On a phone the sort is a select instead. */
export default function WritsHeaderRow({ sort, onSort }: WritsHeaderRowProps) {
  const header = (sortKey: WritSortKey) => <SortHeader sortKey={sortKey} label={WRIT_SORT_LABEL[sortKey]} sort={sort} onSort={onSort} />;
  return (
    <div role="row" className={`${WRIT_ROW_GRID} hidden border-b px-2 text-xs font-medium text-muted-foreground lg:grid`}>
      {header("name")}
      {header("tier")}
      {header("writPrice")}
      <div role="columnheader">Item</div>
      {header("itemPrice")}
      {header("total")}
      <div role="columnheader">Turn-in</div>
    </div>
  );
}
