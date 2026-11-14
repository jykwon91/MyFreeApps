import { getPlatform } from "../platform/configurePlatform";

/**
 * For a mutation's `onQueryStarted`: once it succeeds, puts its answer into the cache with
 * `patch`. Skipped if the active workspace changed while it was on its way: the cache then
 * holds the new workspace's data, and the answer belongs to the old one. A failure patches
 * nothing; the caller reports it.
 */
export async function patchCacheAfterSuccess<Result>(
  queryFulfilled: PromiseLike<{ data: Result }>,
  patch: (data: Result) => void,
): Promise<void> {
  const startedIn = getPlatform().orgStore.get();
  let data: Result;
  try {
    ({ data } = await queryFulfilled);
  } catch {
    return;
  }
  if (getPlatform().orgStore.get() !== startedIn) return;
  patch(data);
}
