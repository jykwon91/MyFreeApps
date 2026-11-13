/**
 * The `test` every no-backend (fully mocked) spec imports, in place of
 * @playwright/test's. For E2E tests only.
 *
 * A mocked spec answers every API call itself, so a stub in the wrong shape
 * can crash a page while the test still passes: an error boundary catches the
 * crash, the rest of the app (sidebar, header) keeps rendering, and the
 * assertions only look at the part that survived. This fixture fails the test
 * on any crash in its pages:
 * - an uncaught error (the context's "weberror"),
 * - a tab that crashed ("Target crashed"), and
 * - an error an error boundary caught, which the boundary announces as a
 *   CAUGHT_ERROR_EVENT on window (see announceCaughtError in @platform/ui).
 *
 * A test that crashes a page on purpose opts in with
 * `test.use({ allowCrashes: true })` and asserts on the `pageCrashes` fixture.
 * A test that opens its own context (browser.newContext) hands it to the
 * `guardContext` fixture so its pages are guarded too.
 *
 * It also fails a passing test whose app pages (on the baseURL origin) don't
 * end with exactly one main landmark, the one a screen reader jumps to the
 * content by. The static check (test_single_main_landmark.py) only stops a
 * second <main>; this one also sees a page with none. A page that closes, or
 * leaves the app's origin, while it's counted is skipped. A test that ends off
 * an app page on purpose opts out with `test.use({ mainLandmarkOptOut: "<why>" })`.
 */
import { test as base, expect, type BrowserContext, type Page } from "@playwright/test";
import type { CaughtErrorDetail } from "../src/types/caught-error-detail";
import { blankOptOutProblem } from "./blankOptOutProblem";
import { CAUGHT_ERROR_EVENT_NAME } from "./constants/caughtErrorEvent";
import { CONTEXT_CLOSE_TIMEOUT_MS } from "./constants/contextCloseTimeout";
import { CRASH_GUARD_FIXTURE_TIMEOUT_MS } from "./constants/crashGuardFixtureTimeout";
import { CRASH_REPORT_SETTLE_TIMEOUT_MS } from "./constants/crashReportSettleTimeout";
import { countMainLandmarks } from "./countMainLandmarks";
import { crashVerdict } from "./crashVerdict";
import { mainLandmarkCheckApplies } from "./mainLandmarkCheckApplies";
import { mainLandmarkVerdict } from "./mainLandmarkVerdict";
import { settleWithin } from "./settleWithin";
import type { CrashGuardFixtures } from "./types/CrashGuardFixtures";
import type { CrashGuardInternalFixtures } from "./types/CrashGuardInternalFixtures";
import type { CrashGuardOptions } from "./types/CrashGuardOptions";
import type { CrashLedger } from "./types/CrashLedger";

/** The window function the init script forwards each caught-error event to. */
const REPORT_BINDING = "__platformReportCaughtError";
/** The window function that resolves once every report the page has sent has reached the test. */
const SETTLE_REPORTS = "__platformSettleCrashReports";

/**
 * Waits until the page's crash reports have all arrived, for at most
 * CRASH_REPORT_SETTLE_TIMEOUT_MS. A report is an exposeFunction call, which is
 * asynchronous, so a crash just before the test ends could still be in flight
 * when the teardown checks. The evaluate's reply also comes after any
 * "weberror" the page raised before it. A page that has closed, crashed or is
 * between documents has nothing left to deliver, and a stuck one never
 * answers; neither may keep the guard from reporting what it has.
 */
async function settleReports(page: Page): Promise<void> {
  const settled = page.evaluate(async (settle) => {
    const settleReports: unknown = Reflect.get(window, settle);
    if (typeof settleReports === "function") await settleReports();
  }, SETTLE_REPORTS);
  // A rejection means the page closed, crashed or is navigating away: no document left to report from.
  await settleWithin(settled, CRASH_REPORT_SETTLE_TIMEOUT_MS);
}

/**
 * Starts recording crashes from every page in `context`, existing and future,
 * into `crashes`. Must run before the context's pages load the app, so the
 * init script is in place for their first document.
 */
async function watchContext(context: BrowserContext, ledger: CrashLedger): Promise<void> {
  const { crashes } = ledger;
  const watchForTabCrash = (page: Page) => {
    page.on("crash", () => {
      ledger.crashedPages.add(page);
      crashes.push(`tab crashed: ${page.url()}`);
    });
  };
  context.pages().forEach(watchForTabCrash);
  context.on("page", watchForTabCrash);
  context.on("weberror", (webError) => {
    const error = webError.error();
    crashes.push(`uncaught ${error.name}: ${error.message}\n${error.stack ?? ""}`);
  });
  await context.exposeFunction(REPORT_BINDING, (detail: CaughtErrorDetail) => {
    crashes.push(`caught by ${detail.source}: ${detail.name}: ${detail.message}\n${detail.stack}`);
  });
  await context.addInitScript(
    ({ eventName, binding, settle }) => {
      const inFlight = new Set<Promise<unknown>>();
      window.addEventListener(eventName, (event) => {
        const report: unknown = Reflect.get(window, binding);
        if (!(event instanceof CustomEvent) || typeof report !== "function") return;
        const sent = Promise.resolve(report(event.detail));
        inFlight.add(sent);
        void sent.finally(() => inFlight.delete(sent));
      });
      Reflect.set(window, settle, () => Promise.allSettled([...inFlight]));
    },
    { eventName: CAUGHT_ERROR_EVENT_NAME, binding: REPORT_BINDING, settle: SETTLE_REPORTS },
  );
}

export const test = base.extend<CrashGuardOptions & CrashGuardFixtures & CrashGuardInternalFixtures>({
  allowCrashes: [false, { option: true }],
  mainLandmarkOptOut: [null, { option: true }],
  crashLedger: [
    async ({ context, allowCrashes, mainLandmarkOptOut, baseURL }, use, testInfo) => {
      const ledger: CrashLedger = { crashes: [], contexts: [context], crashedPages: new WeakSet() };
      await watchContext(context, ledger);

      await use(ledger);

      try {
        // Every wait here is bounded: a crashed page is skipped, and a stuck one gets
        // CRASH_REPORT_SETTLE_TIMEOUT_MS. A context the test closed has no pages left.
        const live = ledger.contexts
          .flatMap((c) => c.pages())
          .filter((page) => !page.isClosed() && !ledger.crashedPages.has(page));
        await Promise.all(live.map(settleReports));
        // A blank opt-out is reported with any crash, so neither hides the other.
        const problems = [blankOptOutProblem(testInfo, mainLandmarkOptOut), crashVerdict(ledger.crashes, allowCrashes)];
        const reported = problems.filter((problem): problem is string => problem !== null);
        if (reported.length > 0) throw new Error(reported.join("\n\n"));
        // After the crash verdict, so a crash is always the failure reported. Each page is
        // re-checked while it's counted: one that closes or leaves the app's origin is skipped.
        if (mainLandmarkCheckApplies(testInfo, mainLandmarkOptOut)) {
          const readings = await Promise.all(live.map((page) => countMainLandmarks(page, baseURL)));
          const landmarks = mainLandmarkVerdict(readings);
          if (landmarks !== null) throw new Error(landmarks);
        }
      } finally {
        // Extra contexts are closed only after their reports settled; the fixture's own context is Playwright's.
        await Promise.all(ledger.contexts.slice(1).map((c) => settleWithin(c.close(), CONTEXT_CLOSE_TIMEOUT_MS)));
      }
    },
    // Its own budget, apart from the test's, so a test that ends near its timeout still gets these messages.
    { auto: true, timeout: CRASH_GUARD_FIXTURE_TIMEOUT_MS },
  ],
  pageCrashes: async ({ crashLedger }, use) => {
    await use(crashLedger.crashes);
  },
  guardContext: async ({ crashLedger }, use) => {
    await use(async (context: BrowserContext) => {
      if (crashLedger.contexts.includes(context)) return;
      crashLedger.contexts.push(context);
      await watchContext(context, crashLedger);
    });
  },
});

export { expect };
