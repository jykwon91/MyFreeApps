import type { ProfileListQuery } from "../types/profile-list/profile-list-query";
import type { ProfileListState } from "../types/profile-list/profile-list-state";

/**
 * Reads a profile list query as what a screen needs: the items once loaded, whether the last load
 * failed, and a retry. Items stay undefined until a load lands, so a failed first load is never
 * mistaken for an empty list.
 */
export function profileListState<Item>({ currentData, isError, refetch }: ProfileListQuery<Item>): ProfileListState<Item> {
  return {
    items: currentData?.items,
    hasError: isError,
    retry: async () => {
      await refetch();
    },
  };
}
