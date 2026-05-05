import { cn } from "@/shared/utils/cn";
import {
  APPLICANT_STAGES,
  APPLICANT_STAGE_LABELS,
} from "@/shared/lib/applicant-labels";
import type { ApplicantStage } from "@/shared/types/applicant/applicant-stage";

export interface ApplicantStageFilterProps {
  value: ApplicantStage | null;
  onChange: (stage: ApplicantStage | null) => void;
}

interface Chip {
  value: ApplicantStage | null;
  label: string;
}

const CHIPS: Chip[] = [
  { value: null, label: "All" },
  ...APPLICANT_STAGES.map((s) => ({ value: s, label: APPLICANT_STAGE_LABELS[s] })),
];

/**
 * Horizontal chip row for filtering applicants by stage. Mirrors the
 * ``InquiryStageFilter`` pattern: 44px touch targets, horizontal scroll on
 * mobile (``overflow-x-auto`` + ``flex-nowrap``), URL-state sync handled by
 * the parent page via ``useSearchParams``.
 */
export default function ApplicantStageFilter({ value, onChange }: ApplicantStageFilterProps) {
  return (
    <div
      role="tablist"
      aria-label="Filter applicants by stage"
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
            data-testid={`applicant-filter-${key}`}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
