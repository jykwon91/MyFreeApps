export interface DetailLoadModeArgs {
  /** The record has loaded (now or on an earlier request). */
  hasData: boolean;
  /** The latest load failed: RTK's `error`, which stays set until a load succeeds. */
  hasError: boolean;
}
