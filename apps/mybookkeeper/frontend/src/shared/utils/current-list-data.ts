import type { ListQueryData } from "@/shared/types/list-query-data";

/**
 * The answer a list shows for its current filters.
 *
 * RTK Query's `data` keeps the previous argument's answer while a new argument loads and after
 * it failed, so a list reading it shows the previous filter's rows under a new filter, even under
 * that filter's error. `currentData` belongs to the current argument only.
 *
 * "Load more" is the one exception (`isLoadMore`): it asks again with the same filters and a bigger
 * limit, so the rows already shown are the start of the answer and stay up while the rest loads,
 * or under its error.
 */
export function currentListData<T>({ data, currentData }: ListQueryData<T>, isLoadMore: boolean): T | undefined {
  return currentData ?? (isLoadMore ? data : undefined);
}
