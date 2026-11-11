import type { SortOrder } from "@myjobhunter/api-client/types/application/sort-order";
import type { CompanySortField } from "@myjobhunter/api-client/types/company/company-sort-field";

export type CompanySortKey = `${CompanySortField}-${SortOrder}`;
