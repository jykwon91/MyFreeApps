export interface QueryStatusOptions {
  /** The query's last attempt failed (RTK keeps ``error`` until one succeeds). */
  failed: boolean;
  /** A request is in flight — for a failed query, that is a retry. */
  fetching: boolean;
}
