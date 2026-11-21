import FilterChipRow, { type FilterChipOption } from "@/shared/components/ui/FilterChipRow";
import { LISTING_STATUSES, LISTING_STATUS_LABELS } from "@mybookkeeper/api-client/constants/listingLabels";
import type { ListingStatus } from "@mybookkeeper/api-client/types/listing/listing-status";

export interface ListingStatusFilterProps {
  value: ListingStatus | null;
  onChange: (status: ListingStatus | null) => void;
}

const OPTIONS: ReadonlyArray<FilterChipOption<ListingStatus>> = [
  { value: null, label: "All" },
  ...LISTING_STATUSES.map((v) => ({ value: v, label: LISTING_STATUS_LABELS[v] })),
];

/**
 * Chip row for filtering by status. URL-state sync is handled by the parent
 * page via ``useSearchParams``.
 */
export default function ListingStatusFilter({ value, onChange }: ListingStatusFilterProps) {
  return (
    <FilterChipRow
      options={OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Filter listings by status"
      testIdPrefix="listing-filter"
    />
  );
}
