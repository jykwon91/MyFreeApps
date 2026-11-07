/** A mocked GET endpoint that fails until recovered, then holds its answers until released. */
export interface FlakyEndpoint {
  /** From now on the endpoint answers successfully (once released). */
  recover: () => void;
  /** Lets held successful answers through. */
  release: () => void;
  /** How many GETs the endpoint has received. */
  loads: () => number;
}
