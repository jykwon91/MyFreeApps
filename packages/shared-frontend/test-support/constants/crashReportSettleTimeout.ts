/**
 * How long the crash guard waits for one page's in-flight crash reports before
 * it checks anyway. A page whose main thread is stuck (a busy loop, an alert
 * nothing dismissed) never answers, and without a cap the teardown would run
 * until the test timeout without printing the crashes it collected.
 */
export const CRASH_REPORT_SETTLE_TIMEOUT_MS = 3_000;
