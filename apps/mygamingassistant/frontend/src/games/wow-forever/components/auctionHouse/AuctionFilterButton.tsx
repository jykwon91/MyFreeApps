import { SlidersHorizontal } from "lucide-react";

interface AuctionFilterButtonProps {
  /** How many filters are on. */
  count: number;
  open: boolean;
  onClick: () => void;
}

/** The "Filters" button: opens the phone's sheet or the inline panel, and always shows how many filters are on. */
export default function AuctionFilterButton({ count, open, onClick }: AuctionFilterButtonProps) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onClick}
      className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md border bg-card px-4 text-sm font-medium hover:bg-muted/40"
      data-testid="auction-filters-button"
    >
      <SlidersHorizontal className="size-4" aria-hidden />
      Filters
      {count > 0 && (
        <span
          className="inline-flex min-w-6 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-semibold text-primary-foreground"
          aria-label={`${count} on`}
          data-testid="auction-filters-count"
        >
          {count}
        </span>
      )}
    </button>
  );
}
