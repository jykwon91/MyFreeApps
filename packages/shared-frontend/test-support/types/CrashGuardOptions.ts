export interface CrashGuardOptions {
  /**
   * False unless a spec opts in with `test.use({ allowCrashes: true })`, for a
   * test that drives a crash on purpose (and asserts it through `pageCrashes`).
   */
  allowCrashes: boolean;
}
