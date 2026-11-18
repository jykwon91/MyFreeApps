/** What a picker's query reports: the choices once they've loaded, and the error if the last try failed. */
export interface PickerLoadState {
  hasLoaded: boolean;
  error: unknown;
  refetch: () => PromiseLike<unknown>;
}
