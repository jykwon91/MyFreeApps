/** What decides which better-plans state is showing. */
export interface BetterPlansModeArgs {
  hasSearched: boolean;
  isFetching: boolean;
  isError: boolean;
  groupCount: number;
}
