import type { ApplicationSortField } from "@myjobhunter/api-client/types/application/application-sort-field";
import type { SortOrder } from "@myjobhunter/api-client/types/application/sort-order";

export type ApplicationSortKey = `${ApplicationSortField}-${SortOrder}`;
