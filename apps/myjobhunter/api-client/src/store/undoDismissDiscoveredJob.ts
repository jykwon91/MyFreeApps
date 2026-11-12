import type { DiscoverCacheDispatch } from "../types/discovery/discover-cache-dispatch";
import { discoverApi } from "./discoverApi";

/**
 * Brings a dismissed posting back. The website and the phone run this from an
 * Undo toast, after the posting's card has unmounted, so it is dispatched
 * untracked: no hook is left to clear its record from the store. The inbox
 * refetches through the endpoint's invalidation; a failure is rethrown for the
 * caller to show.
 */
export function undoDismissDiscoveredJob(jobId: string) {
  return (dispatch: DiscoverCacheDispatch): Promise<void> =>
    dispatch(discoverApi.endpoints.undoDismissDiscoveredJob.initiate(jobId, { track: false })).unwrap();
}
