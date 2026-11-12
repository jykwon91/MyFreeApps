import type { RefinementActionCallbacks } from "./refinement-action-callbacks";

export interface RefinementProposalOptions extends RefinementActionCallbacks {
  /** Another action on the session is in flight, such as generating for a picked line. */
  externalPending?: boolean;
}
