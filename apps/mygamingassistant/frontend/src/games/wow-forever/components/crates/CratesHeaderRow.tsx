import { CRATE_ROW_GRID } from "@/games/wow-forever/components/crates/crateRowStyles";
import SortHeader from "@/games/wow-forever/components/professionTiers/SortHeader";
import { CRATE_SORT_LABEL } from "@/games/wow-forever/data/professions/crates/crateSortOptions";
import type { CrateSort } from "@/games/wow-forever/types/crates/crateSort";
import type { CrateSortKey } from "@/games/wow-forever/types/crates/crateSortKey";

interface CratesHeaderRowProps {
  sort: CrateSort;
  onSort: (key: CrateSortKey) => void;
}

/** The wide grid's column titles; the sortable ones are buttons. On a phone the sort is a select instead. */
export default function CratesHeaderRow({ sort, onSort }: CratesHeaderRowProps) {
  const header = (sortKey: CrateSortKey) => <SortHeader sortKey={sortKey} label={CRATE_SORT_LABEL[sortKey]} sort={sort} onSort={onSort} />;
  return (
    <div role="row" className={`${CRATE_ROW_GRID} hidden border-b px-2 text-xs font-medium text-muted-foreground lg:grid`}>
      {header("name")}
      {header("tier")}
      {header("cratePrice")}
      <div role="columnheader">Cheapest bundle</div>
      {header("bundleCost")}
      {header("total")}
      {header("reward")}
      {header("perReward")}
    </div>
  );
}
