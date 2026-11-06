import { Select } from "@platform/ui";
import ChoiceSelect from "@/games/wow-forever/components/shared/ChoiceSelect";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { FEATURE_AREAS } from "@/games/wow-forever/data/featureRequests/featureRequestEnums";
import { FEATURE_AREA_LABEL } from "@/games/wow-forever/data/featureRequests/featureRequestLabels";
import { TRIAGE_SORTS, TRIAGE_STATUS_FILTERS } from "@/games/wow-forever/data/featureRequests/triage/triageEnums";
import { TRIAGE_SORT_LABEL, TRIAGE_STATUS_FILTER_LABEL } from "@/games/wow-forever/data/featureRequests/triage/triageLabels";
import type { TriageListFilters } from "@/games/wow-forever/types/featureRequests/triage/triageListFilters";

interface TriageFiltersProps {
  filters: TriageListFilters;
  onChange: (patch: Partial<TriageListFilters>) => void;
}

const STATUS_OPTIONS = TRIAGE_STATUS_FILTERS.map((id) => ({ id, label: TRIAGE_STATUS_FILTER_LABEL[id] }));

/** Status chips (scrolling on a phone), then the area and sort selects. */
export default function TriageFilters({ filters, onChange }: TriageFiltersProps) {
  return (
    <div className="space-y-2" data-section="filters">
      <div className="overflow-x-auto">
        <SegmentedToggle
          label="Status"
          options={STATUS_OPTIONS}
          value={filters.status}
          onChange={(status) => onChange({ status })}
          className="flex-nowrap whitespace-nowrap"
        />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-40">
          <ChoiceSelect
            id="triage-area"
            label="Area"
            options={FEATURE_AREAS}
            labels={FEATURE_AREA_LABEL}
            value={filters.area ?? undefined}
            onChange={(area) => onChange({ area: area ?? null })}
            emptyLabel="All areas"
          />
        </div>
        <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1">
          <label htmlFor="triage-sort" className="text-sm font-medium">
            Sort
          </label>
          <Select
            id="triage-sort"
            value={filters.sort}
            onChange={(e) => onChange({ sort: TRIAGE_SORTS.find((s) => s === e.target.value) ?? filters.sort })}
            className="min-h-11 bg-card text-base sm:text-sm"
          >
            {TRIAGE_SORTS.map((s) => (
              <option key={s} value={s}>
                {TRIAGE_SORT_LABEL[s]}
              </option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}
