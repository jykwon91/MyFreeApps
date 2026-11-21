import { ArrowDown, ArrowUp } from "lucide-react";
import { toggleColumnSort } from "@/games/wow-forever/lib/auctionHouse/auctionColumnSort";
import type { AuctionColumnSort } from "@/games/wow-forever/types/auctionHouse/auctionColumnSort";
import type { SortDirection } from "@/games/wow-forever/types/professionTiers/sortDirection";

interface AuctionMobileSortProps {
  colSort: AuctionColumnSort | null;
  colDir: SortDirection;
  onColSort: (sort: AuctionColumnSort, dir: SortDirection) => void;
}

const COLUMNS: { id: AuctionColumnSort; label: string }[] = [
  { id: "item", label: "Item" },
  { id: "market", label: "Market" },
  { id: "cheapest", label: "Cheapest" },
  { id: "onsale", label: "On sale" },
];

/** Compact column-sort row shown below the results count on phones (hidden on sm+). */
export default function AuctionMobileSort({ colSort, colDir, onColSort }: AuctionMobileSortProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:hidden" aria-label="Sort results">
      <span className="text-xs text-muted-foreground">Sort:</span>
      {COLUMNS.map(({ id, label }) => {
        const active = colSort === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              const next = toggleColumnSort(colSort, colDir, id);
              onColSort(next.colSort, next.colDir);
            }}
            aria-pressed={active}
            className={`inline-flex min-h-[44px] items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            {active && colDir === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : null}
            {active && colDir === "desc" ? <ArrowDown className="h-3 w-3" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
