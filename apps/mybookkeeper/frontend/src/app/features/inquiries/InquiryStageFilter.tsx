import { cn } from "@/shared/utils/cn";
import { INQUIRY_STAGES, INQUIRY_STAGE_LABELS } from "@/shared/lib/inquiry-labels";
import type { InquiryStage } from "@/shared/types/inquiry/inquiry-stage";

interface Props {
  value: InquiryStage | null;
  onChange: (stage: InquiryStage | null) => void;
}

interface Chip {
  value: InquiryStage | null;
  label: string;
}

const CHIPS: Chip[] = [
  { value: null, label: "All" },
  ...INQUIRY_STAGES.map((s) => ({ value: s, label: INQUIRY_STAGE_LABELS[s] })),
];

/**
 * Horizontal chip row for filtering inquiries by stage. Mirrors the
 * ``ListingStatusFilter`` pattern: 44px touch targets, horizontal scroll on
 * mobile (``overflow-x-auto`` + ``flex-nowrap``), URL-state sync handled by
 * the parent page via ``useSearchParams``.
 */
export default function InquiryStageFilter({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Filter inquiries by stage"
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
            data-testid={`inquiry-filter-${key}`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
