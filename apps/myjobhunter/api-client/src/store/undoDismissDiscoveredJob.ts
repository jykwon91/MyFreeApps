import type { DiscoverCacheDispatch } from "../types/discovery/discover-cache-dispatch";
import { discoverApi } from "./discoverApi";

/**
 * Brings a dismissed posting back to the inbox. The website and the phone run
 * this from the Undo toast, after the posting's card has unmounted, and from a
 * card's Restore in the Dismissed view, which unmounts once the refetched list
 * drops it. Either way it is dispatched untracked: no hook is left to clear its
 * record from the store. Every Discover list (inbox, Saved, Dismissed) refetches
 * through the endpoint's invalidation, on failure too, so a posting already
 * restored elsewhere (404) leaves the Dismissed list; a failure is rethrown for
 * the caller to show.
 */
export function undoDismissDiscoveredJob(jobId: string) {
  return (dispatch: DiscoverCacheDispatch): Promise<void> =>
    dispatch(discoverApi.endpoints.undoDismissDiscoveredJob.initiate(jobId, { track: false })).unwrap();
}
