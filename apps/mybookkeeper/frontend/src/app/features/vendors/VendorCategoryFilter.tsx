import { cn } from "@/shared/utils/cn";
import {
  VENDOR_CATEGORIES,
  VENDOR_CATEGORY_LABELS,
} from "@/shared/lib/vendor-labels";
import type { VendorCategory } from "@/shared/types/vendor/vendor-category";

interface Props {
  value: VendorCategory | null;
  onChange: (category: VendorCategory | null) => void;
}

interface Chip {
  value: VendorCategory | null;
  label: string;
}

const CHIPS: Chip[] = [
  { value: null, label: "All" },
  ...VENDOR_CATEGORIES.map((c) => ({ value: c, label: VENDOR_CATEGORY_LABELS[c] })),
];

/**
 * Horizontal chip row for filtering vendors by trade category. Mirrors the
 * ``ApplicantStageFilter`` pattern: 44px touch targets, horizontal scroll
 * on mobile (``overflow-x-auto`` + ``flex-nowrap``), URL-state sync handled
 * by the parent page via ``useSearchParams``.
 */
export default function VendorCategoryFilter({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Filter vendors by category"
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
            data-testid={`vendor-filter-${key}`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
