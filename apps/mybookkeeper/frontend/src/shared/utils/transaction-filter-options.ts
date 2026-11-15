import type { Property } from "@mybookkeeper/api-client/types/property/property";
import { TAX_RELEVANT_OPTIONS } from "@mybookkeeper/api-client/constants/taxRelevantOptions";
import { UNASSIGNED_PROPERTY_ID } from "@mybookkeeper/api-client/constants/unassignedProperty";
import {
  NO_PROPERTY_FILTER_LABEL,
  STATUS_COLUMN_FILTER_OPTIONS,
  TYPE_COLUMN_FILTER_OPTIONS,
} from "@/shared/lib/transaction-column-filters";
import { formatTag } from "@/shared/utils/tag";
import type { FilterOptions } from "@/shared/types/transaction/filter-options";

/** The choices of each column filter in the transactions table header. */
export function transactionFilterOptions(categories: readonly string[], properties: readonly Property[]): FilterOptions {
  return {
    status: STATUS_COLUMN_FILTER_OPTIONS,
    transaction_type: TYPE_COLUMN_FILTER_OPTIONS,
    category: [...categories].sort().map((category) => ({ value: category, label: formatTag(category) })),
    property_id: [
      { value: UNASSIGNED_PROPERTY_ID, label: NO_PROPERTY_FILTER_LABEL },
      ...properties.map((property) => ({ value: property.id, label: property.name })),
    ],
    tax_relevant: [...TAX_RELEVANT_OPTIONS],
  };
}
