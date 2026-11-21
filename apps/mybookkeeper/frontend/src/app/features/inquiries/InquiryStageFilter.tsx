import FilterChipRow, { type FilterChipOption } from "@/shared/components/ui/FilterChipRow";
import { INQUIRY_STAGES, INQUIRY_STAGE_LABELS } from "@mybookkeeper/api-client/constants/inquiryLabels";
import type { InquiryStage } from "@mybookkeeper/api-client/types/inquiry/inquiry-stage";

export interface InquiryStageFilterProps {
  value: InquiryStage | null;
  onChange: (stage: InquiryStage | null) => void;
}

const OPTIONS: ReadonlyArray<FilterChipOption<InquiryStage>> = [
  { value: null, label: "All" },
  ...INQUIRY_STAGES.map((v) => ({ value: v, label: INQUIRY_STAGE_LABELS[v] })),
];

/**
 * Chip row for filtering by stage. URL-state sync is handled by the parent
 * page via ``useSearchParams``.
 */
export default function InquiryStageFilter({ value, onChange }: InquiryStageFilterProps) {
  return (
    <FilterChipRow
      options={OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Filter inquiries by stage"
      testIdPrefix="inquiry-filter"
    />
  );
}
