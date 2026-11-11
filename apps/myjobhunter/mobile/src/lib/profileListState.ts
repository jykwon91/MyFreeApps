import type { ProfileListQuery } from "../types/ProfileListQuery";
import type { ProfileListState } from "../types/ProfileListState";

export function profileListState<Item>({ currentData, isError, refetch }: ProfileListQuery<Item>): ProfileListState<Item> {
  return {
    items: currentData?.items,
    hasError: isError,
    retry: () => {
      refetch();
    },
  };
}
