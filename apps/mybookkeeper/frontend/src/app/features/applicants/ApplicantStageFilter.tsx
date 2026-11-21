import FilterChipRow, { type FilterChipOption } from "@/shared/components/ui/FilterChipRow";
import { APPLICANT_STAGES, APPLICANT_STAGE_LABELS } from "@mybookkeeper/api-client/constants/applicantLabels";
import type { ApplicantStage } from "@mybookkeeper/api-client/types/applicant/applicant-stage";

export interface ApplicantStageFilterProps {
  value: ApplicantStage | null;
  onChange: (stage: ApplicantStage | null) => void;
}

const OPTIONS: ReadonlyArray<FilterChipOption<ApplicantStage>> = [
  { value: null, label: "All" },
  ...APPLICANT_STAGES.map((v) => ({ value: v, label: APPLICANT_STAGE_LABELS[v] })),
];

/**
 * Chip row for filtering by stage. URL-state sync is handled by the parent
 * page via ``useSearchParams``.
 */
export default function ApplicantStageFilter({ value, onChange }: ApplicantStageFilterProps) {
  return (
    <FilterChipRow
      options={OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Filter applicants by stage"
      testIdPrefix="applicant-filter"
    />
  );
}
