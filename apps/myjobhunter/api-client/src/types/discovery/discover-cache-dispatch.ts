import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import type { DiscoverCacheState } from "./discover-cache-state";

/** A store's dispatch, as far as a Discovery thunk needs: it reaches the api's cache. */
export type DiscoverCacheDispatch = ThunkDispatch<DiscoverCacheState, unknown, UnknownAction>;
