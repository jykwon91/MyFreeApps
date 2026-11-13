export interface CrashGuardOptions {
  /**
   * False unless a spec opts in with `test.use({ allowCrashes: true })`, for a
   * test that drives a crash on purpose (and asserts it through `pageCrashes`).
   */
  allowCrashes: boolean;
  /**
   * null unless a spec opts out of the main-landmark check with
   * `test.use({ mainLandmarkOptOut: "<why>" })`, for a test that deliberately
   * ends on something that isn't an app page (a raw API response, a file the
   * dev server serves). The reason is required and must say why; never use it
   * to pass a page that is missing its main landmark or has two.
   */
  mainLandmarkOptOut: string | null;
}
