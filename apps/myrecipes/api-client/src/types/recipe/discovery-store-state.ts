import type { DiscoveryState } from "./discovery-state";

/** The part of an app's store the discovery slice and its thunks read: the slice under `discovery`. */
export interface DiscoveryStoreState {
  discovery: DiscoveryState;
}
