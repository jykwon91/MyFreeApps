import type { SortingState } from "@platform/ui";
import { useApplicationsPages } from "@myjobhunter/api-client/hooks/useApplicationsPages";
import type { ApplicationsFilter } from "@myjobhunter/api-client/types/application/applications-filter";
import type { ApplicationsPagesState } from "@myjobhunter/api-client/types/application/applications-pages-state";
import { toApplicationsSort } from "@/lib/to-applications-sort";

/** The applications list, sorted on the server by the table's sorting state. `skip` waits for an id. */
export function useApplicationsList(
  filter: ApplicationsFilter,
  sorting: SortingState,
  skip = false,
): ApplicationsPagesState {
  return useApplicationsPages({ ...filter, ...toApplicationsSort(sorting) }, skip);
}
