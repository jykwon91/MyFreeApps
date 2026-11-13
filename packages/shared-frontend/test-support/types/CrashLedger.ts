import type { BrowserContext, Page } from "@playwright/test";

/** What the crash guard has recorded in one test, and which contexts it watches. */
export interface CrashLedger {
  crashes: string[];
  contexts: BrowserContext[];
  /** Pages whose renderer crashed; teardown never waits on them. */
  crashedPages: WeakSet<Page>;
}
