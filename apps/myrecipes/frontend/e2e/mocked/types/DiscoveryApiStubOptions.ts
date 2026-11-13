export interface DiscoveryApiStubOptions {
  /** Status each search answers with, in turn; 200 once the list runs out. */
  searchStatuses?: number[];
  /** Status each read answers with, in turn; 200 once the list runs out. */
  readStatuses?: number[];
  /** Calls to hold until the log's release() is called, so the wait can be looked at. */
  held?: Array<"search" | "read">;
}
