import { X } from "lucide-react";
import type { ActiveAuctionFilter } from "@/games/wow-forever/types/auctionHouse/activeAuctionFilter";
import type { AuctionFilterGroup } from "@/games/wow-forever/types/auctionHouse/auctionFilterGroup";

interface AuctionActiveFiltersProps {
  active: readonly ActiveAuctionFilter[];
  onRemove: (group: AuctionFilterGroup) => void;
  onClear: () => void;
}

const CHIP = "inline-flex min-h-[44px] max-w-full items-center gap-1.5 rounded-full border px-3 text-sm";

/** The filters that are on, each a chip that takes itself off. */
export default function AuctionActiveFilters({ active, onRemove, onClear }: AuctionActiveFiltersProps) {
  if (active.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Active filters" data-testid="auction-active-filters">
      {active.map((f) => (
        <li key={f.group} className="max-w-full">
          <button
            type="button"
            onClick={() => onRemove(f.group)}
            aria-label={`Remove filter: ${f.label}`}
            className={`${CHIP} bg-card hover:bg-muted/40`}
          >
            <span className="min-w-0 truncate">{f.label}</span>
            <X className="size-4 shrink-0" aria-hidden />
          </button>
        </li>
      ))}
      {active.length > 1 && (
        <li>
          <button type="button" onClick={onClear} className={`${CHIP} border-transparent font-medium underline`}>
            Clear all
          </button>
        </li>
      )}
    </ul>
  );
}
