import FilterChipRow, { type FilterChipOption } from "@/shared/components/ui/FilterChipRow";
import { VENDOR_CATEGORIES, VENDOR_CATEGORY_LABELS } from "@mybookkeeper/api-client/constants/vendorLabels";
import type { VendorCategory } from "@mybookkeeper/api-client/types/vendor/vendor-category";

export interface VendorCategoryFilterProps {
  value: VendorCategory | null;
  onChange: (category: VendorCategory | null) => void;
}

const OPTIONS: ReadonlyArray<FilterChipOption<VendorCategory>> = [
  { value: null, label: "All" },
  ...VENDOR_CATEGORIES.map((v) => ({ value: v, label: VENDOR_CATEGORY_LABELS[v] })),
];

/**
 * Chip row for filtering by trade category. URL-state sync is handled by the parent
 * page via ``useSearchParams``.
 */
export default function VendorCategoryFilter({ value, onChange }: VendorCategoryFilterProps) {
  return (
    <FilterChipRow
      options={OPTIONS}
      value={value}
      onChange={onChange}
      ariaLabel="Filter vendors by category"
      testIdPrefix="vendor-filter"
    />
  );
}
