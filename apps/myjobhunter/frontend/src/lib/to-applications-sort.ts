import type { SortingState } from "@platform/ui";
import { DEFAULT_APPLICATIONS_SORT } from "@myjobhunter/api-client/constants/applicationsPaging";
import type { ApplicationsSort } from "@myjobhunter/api-client/types/application/applications-sort";
import { APPLICATION_COLUMN_SORT_FIELDS } from "@/constants/application-column-sort-fields";

/** The server sort for a table's sorting state; the default order when nothing (sortable) is picked. */
export function toApplicationsSort(sorting: SortingState): ApplicationsSort {
  const [first] = sorting;
  const field = first ? APPLICATION_COLUMN_SORT_FIELDS[first.id] : undefined;
  if (!first || !field) return DEFAULT_APPLICATIONS_SORT;
  return { sort: field, order: first.desc ? "desc" : "asc" };
}
