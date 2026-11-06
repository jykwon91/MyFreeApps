import ChoiceSelect from "@/games/wow-forever/components/shared/ChoiceSelect";
import SegmentedToggle from "@/games/wow-forever/components/shared/SegmentedToggle";
import { BOARD_SORT_OPTIONS, BOARD_STATUS_OPTIONS } from "@/games/wow-forever/data/featureRequests/featureRequestBoard";
import { FEATURE_AREAS } from "@/games/wow-forever/data/featureRequests/featureRequestEnums";
import { FEATURE_AREA_LABEL } from "@/games/wow-forever/data/featureRequests/featureRequestLabels";
import type { BoardFilters } from "@/games/wow-forever/types/featureRequests/boardFilters";

interface FeatureRequestFiltersProps {
  filters: BoardFilters;
  onChange: (patch: Partial<BoardFilters>) => void;
}

/** The board's status chips, then the area select and the sort toggle side by side. All kept in the URL. */
export default function FeatureRequestFilters({ filters, onChange }: FeatureRequestFiltersProps) {
  return (
    <div className="space-y-2" data-section="filters">
      <div className="overflow-x-auto">
        <SegmentedToggle
          label="Status"
          options={BOARD_STATUS_OPTIONS}
          value={filters.status}
          onChange={(status) => onChange({ status })}
        />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1 basis-40">
          <ChoiceSelect
            id="feature-request-area"
            label="Area"
            options={FEATURE_AREAS}
            labels={FEATURE_AREA_LABEL}
            value={filters.area ?? undefined}
            onChange={(area) => onChange({ area: area ?? null })}
            emptyLabel="All areas"
          />
        </div>
        <SegmentedToggle
          label="Sort"
          options={BOARD_SORT_OPTIONS}
          value={filters.sort}
          onChange={(sort) => onChange({ sort })}
        />
      </div>
    </div>
  );
}
