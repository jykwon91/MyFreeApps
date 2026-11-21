import { ArrowDown, ArrowDownUp, ArrowUp } from "lucide-react";
import { toggleColumnSort } from "@/games/wow-forever/lib/auctionHouse/auctionColumnSort";
import type { AuctionColumnSort } from "@/games/wow-forever/types/auctionHouse/auctionColumnSort";
import type { SortDirection } from "@/games/wow-forever/types/professionTiers/sortDirection";

export interface AuctionColumnHeaderProps {
  id: AuctionColumnSort;
  label: string;
  colSort: AuctionColumnSort | null;
  colDir: SortDirection;
  onColSort: (sort: AuctionColumnSort, dir: SortDirection) => void;
}

/** A single sortable column header cell for the Auction House results table. */
export default function AuctionColumnHeader({ id, label, colSort, colDir, onColSort }: AuctionColumnHeaderProps) {
  const active = colSort === id;
  const ariaSort: "ascending" | "descending" | "none" = active ? (colDir === "asc" ? "ascending" : "descending") : "none";

  function handleClick() {
    const next = toggleColumnSort(colSort, colDir, id);
    onColSort(next.colSort, next.colDir);
  }

  return (
    <div role="columnheader" aria-sort={ariaSort}>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex min-h-[44px] items-center gap-1 rounded text-xs font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active ? "text-foreground" : "text-muted-foreground"}`}
      >
        {label}
        {active && colDir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : null}
        {active && colDir === "desc" ? <ArrowDown className="h-3 w-3" aria-hidden /> : null}
        {!active ? <ArrowDownUp className="h-3 w-3 opacity-40" aria-hidden /> : null}
      </button>
    </div>
  );
}
