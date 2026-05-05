import { cn } from "@/shared/utils/cn";
import { LISTING_STATUSES, LISTING_STATUS_LABELS } from "@/shared/lib/listing-labels";
import type { ListingStatus } from "@/shared/types/listing/listing-status";

export interface ListingStatusFilterProps {
  value: ListingStatus | null;
  onChange: (status: ListingStatus | null) => void;
}

interface Chip {
  value: ListingStatus | null;
  label: string;
}

const CHIPS: Chip[] = [
  { value: null, label: "All" },
  ...LISTING_STATUSES.map((s) => ({ value: s, label: LISTING_STATUS_LABELS[s] })),
];

/**
 * Horizontal chip row for filtering listings by status. On mobile the row
 * scrolls horizontally (overflow-x-auto, flex-nowrap) so all five chips remain
 * reachable without forcing a wrap. Touch targets are ≥ 44px tall.
 */
export default function ListingStatusFilter({ value, onChange }: ListingStatusFilterProps) {
  return (
    <div
      role="tablist"
      aria-label="Filter listings by status"
      className="flex flex-nowrap overflow-x-auto gap-2 pb-1 -mx-1 px-1"
    >
      {CHIPS.map((chip) => {
        const active = chip.value === value;
        const key = chip.value ?? "all";
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(chip.value)}
            className={cn(
              "shrink-0 min-h-[44px] px-4 rounded-full text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
            data-testid={`listing-filter-${key}`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
