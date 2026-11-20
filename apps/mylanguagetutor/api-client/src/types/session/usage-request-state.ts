/** The parts of the usage query's state that say how fresh its answer is. */
export interface UsageRequestState {
  isSuccess: boolean;
  isFetching: boolean;
  /** When the latest request was sent (ms since the epoch); none before the first. */
  startedTimeStamp?: number;
}
