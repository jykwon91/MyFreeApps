import CrateGridRow from "@/games/wow-forever/components/crates/CrateGridRow";
import CratesHeaderRow from "@/games/wow-forever/components/crates/CratesHeaderRow";
import type { CrateRow } from "@/games/wow-forever/types/crates/crateRow";
import type { CrateSort } from "@/games/wow-forever/types/crates/crateSort";
import type { CrateSortKey } from "@/games/wow-forever/types/crates/crateSortKey";

interface CratesGridProps {
  rows: readonly CrateRow[];
  sort: CrateSort;
  onSort: (key: CrateSortKey) => void;
  loading: boolean;
}

/** The crates: a table with sortable column headers from lg up, a stack of cards below. */
export default function CratesGrid({ rows, sort, onSort, loading }: CratesGridProps) {
  return (
    <div role="table" aria-label="Waylaid crates" className="space-y-3 lg:space-y-0">
      <CratesHeaderRow sort={sort} onSort={onSort} />
      <div role="rowgroup" className="space-y-3 lg:space-y-0">
        {rows.map((row) => (
          <CrateGridRow key={row.crate.id} row={row} loading={loading} />
        ))}
      </div>
    </div>
  );
}
