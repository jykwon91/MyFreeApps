export interface ListLoadModeArgs {
  /** The query has data, from this load or an earlier one. */
  hasData: boolean;
  /** The query's `error` is set. RTK keeps it through a retry, unlike `isError`. */
  hasError: boolean;
  /** Items the page would list (after any client-side filtering). */
  itemCount: number;
}
