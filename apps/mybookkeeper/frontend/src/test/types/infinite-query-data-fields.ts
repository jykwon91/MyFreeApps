/** What `infiniteQueryData` gives a mocked infinite-query hook result. */
export interface InfiniteQueryDataFields<P> {
  data: { pages: P[]; pageParams: number[] } | undefined;
  currentData: { pages: P[]; pageParams: number[] } | undefined;
  hasNextPage: boolean;
}
