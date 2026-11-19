import WritGridRow from "@/games/wow-forever/components/writs/WritGridRow";
import WritsHeaderRow from "@/games/wow-forever/components/writs/WritsHeaderRow";
import type { WritRow } from "@/games/wow-forever/types/writs/writRow";
import type { WritSort } from "@/games/wow-forever/types/writs/writSort";
import type { WritSortKey } from "@/games/wow-forever/types/writs/writSortKey";

interface WritsGridProps {
  rows: readonly WritRow[];
  sort: WritSort;
  onSort: (key: WritSortKey) => void;
  loading: boolean;
}

/** The writs: a table with sortable column headers from lg up, a stack of cards below. */
export default function WritsGrid({ rows, sort, onSort, loading }: WritsGridProps) {
  return (
    <div role="table" aria-label="Crafting writs" className="space-y-3 lg:space-y-0">
      <WritsHeaderRow sort={sort} onSort={onSort} />
      <div role="rowgroup" className="space-y-3 lg:space-y-0">
        {rows.map((row) => (
          <WritGridRow key={row.writ.id} row={row} loading={loading} />
        ))}
      </div>
    </div>
  );
}
