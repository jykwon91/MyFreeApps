import type { BrowserContext } from "@playwright/test";

export interface CrashGuardFixtures {
  /** Every crash the test's pages hit so far: uncaught errors and errors an error boundary caught. */
  pageCrashes: string[];
  /**
   * Puts a context the test made itself (browser.newContext) under the guard.
   * Call it before opening a page in the context. Don't close the context: the guard closes it once
   * its last crash reports have arrived, and an earlier close can lose them.
   */
  guardContext: (context: BrowserContext) => Promise<void>;
}
