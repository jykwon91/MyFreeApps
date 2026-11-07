/**
 * The parts of an RTK Query result a combined "couldn't load" alert needs.
 *
 * ``error`` rather than ``isError`` is what marks a failed query: RTK clears
 * ``isError`` the moment a retry starts but keeps ``error`` until an attempt
 * succeeds, so it is the only field that still says "failed" mid-retry.
 */
export interface RetryableQuery {
  error?: unknown;
  isFetching: boolean;
  refetch: () => unknown;
}
