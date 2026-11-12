import type { discoverApi } from "../../store/discoverApi";

type UndoDismissThunk = ReturnType<typeof discoverApi.endpoints.undoDismissDiscoveredJob.initiate>;

/** The store state a Discovery thunk reads: whatever holds the api's cache. */
export type DiscoverCacheState = ReturnType<Parameters<UndoDismissThunk>[1]>;
