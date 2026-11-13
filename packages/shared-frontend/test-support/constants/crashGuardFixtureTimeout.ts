/**
 * The crash guard fixture's own time budget, for its setup and teardown
 * together, apart from the test's timeout. Its teardown waits are each bounded
 * (crash reports, main-landmark counts, extra contexts closing), and this
 * covers all of them with room to spare, so a test that ends close to its
 * timeout still gets the crash or landmark message instead of a timeout.
 */
export const CRASH_GUARD_FIXTURE_TIMEOUT_MS = 30_000;
