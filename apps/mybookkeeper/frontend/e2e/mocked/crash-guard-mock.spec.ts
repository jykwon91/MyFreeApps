/**
 * No-backend E2E for the crash guard every mocked spec runs under
 * (@platform/ui/test-support/crashGuard). These tests crash the page on
 * purpose.
 *
 * Without the guard, a stub in the wrong shape crashed the dashboard into
 * PageErrorBoundary while the sidebar kept rendering, and the spec passed.
 */
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { test as guarded, expect } from "@platform/ui/test-support/crashGuard";
import { settleWithin } from "@platform/ui/test-support/settleWithin";
import { CRASH_BROWSER_CLOSE_TIMEOUT_MS } from "@platform/ui/test-support/constants/crashBrowserCloseTimeout";
import { TAB_CRASH_TIMEOUT_MS } from "@platform/ui/test-support/constants/tabCrashTimeout";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const PAGE_FALLBACK = "Well, that wasn't supposed to happen";

/** Opens a dashboard whose GET /summary is `[]` instead of an object, so it reads the keys of nothing and throws. */
async function openCrashingDashboard(page: Page): Promise<void> {
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await page.route(/\/api\/summary(\?|$)/, (route) => route.fulfill(json([])));
  await page.goto("/");
  await expect(page.getByRole("navigation").first()).toBeVisible();
}

async function openDashboard(page: Page): Promise<void> {
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await page.goto("/");
  await expect(page.getByRole("navigation").first()).toBeVisible();
}

/**
 * Kills the page's renderer, as an out-of-memory tab would ("Target crashed"),
 * and waits until Playwright reports it. CDP Page.crash raises the same
 * Inspector.targetCrashed that a real crash does, without loading a URL. The
 * call never answers, because the renderer that would answer is gone.
 */
async function crashTab(page: Page): Promise<void> {
  const crashed = page.waitForEvent("crash", { timeout: TAB_CRASH_TIMEOUT_MS });
  const cdp = await page.context().newCDPSession(page);
  void cdp.send("Page.crash").catch(() => {
    // Expected: the session goes down with the renderer.
  });
  await crashed;
}

/** A page in a second context the test opens itself, as a "friend" opening a shared link would. */
async function guardedExtraPage(
  browser: Browser,
  guardContext: (context: BrowserContext) => Promise<void>,
): Promise<Page> {
  const context = await browser.newContext();
  await guardContext(context);
  return context.newPage();
}

/**
 * Adds `crashableTab`: a guarded page in a browser of its own. A crashed
 * renderer can leave its browser slow or stuck, so the tab-crash test never
 * crashes a page in the browser the rest of the suite shares. The browser
 * runs as a server the test owns: it closes when the test ends, and is killed
 * if it doesn't close in CRASH_BROWSER_CLOSE_TIMEOUT_MS, so it can't outlive
 * the test. The guard checks the crashes it recorded after that.
 */
const test = guarded.extend<{ crashableTab: Page }>({
  crashableTab: async ({ playwright, browserName, launchOptions, baseURL, guardContext }, use) => {
    const server = await playwright[browserName].launchServer(launchOptions);
    try {
      const browser = await playwright[browserName].connect(server.wsEndpoint());
      const crashableContext = await browser.newContext({ baseURL });
      await guardContext(crashableContext);
      await use(await crashableContext.newPage());
    } finally {
      if (!(await settleWithin(server.close(), CRASH_BROWSER_CLOSE_TIMEOUT_MS))) await server.kill();
    }
  },
});

test.describe("by default", () => {
  // Each test sets up its crash and checks the page got there before it calls
  // test.fail(), so a failure in setup fails the test as usual. After that,
  // only the guard can fail it. Each ends right after the crash, so the report
  // can still be in flight when the guard checks. (A crashed tab has its
  // end-to-end test under allowCrashes below; the rule that recorded crashes
  // fail a test unless it allows them is unit-tested in crashVerdict.test.ts.)
  test("a crash an error boundary caught fails the test", async ({ page }) => {
    await openCrashingDashboard(page);
    await expect(page.getByText(PAGE_FALLBACK)).toBeVisible();
    test.fail();
  });

  test("a crash in a context the test opened and guarded fails the test", async ({ browser, guardContext }) => {
    const friend = await guardedExtraPage(browser, guardContext);
    await openCrashingDashboard(friend);
    await expect(friend.getByText(PAGE_FALLBACK)).toBeVisible();
    test.fail();
  });

  test("an uncaught error fails the test", async ({ page }) => {
    await openDashboard(page);
    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("thrown outside React");
      });
    });
    test.fail();
  });
});

test.describe("with allowCrashes", () => {
  test.use({ allowCrashes: true });

  test("records a crash that PageErrorBoundary caught while the shell kept rendering", async ({ page, pageCrashes }) => {
    await openCrashingDashboard(page);

    await expect(page.getByText(PAGE_FALLBACK)).toBeVisible();
    await expect.poll(() => pageCrashes.join("\n")).toContain("caught by PageErrorBoundary: TypeError");
  });

  test("records an uncaught error", async ({ page, pageCrashes }) => {
    await openDashboard(page);

    await page.evaluate(() => {
      setTimeout(() => {
        throw new Error("thrown outside React");
      });
    });

    await expect.poll(() => pageCrashes.join("\n")).toContain("uncaught Error: thrown outside React");
  });

  test("records a crashed tab", async ({ crashableTab, pageCrashes }) => {
    // Chromium on Linux never dispatches Playwright's "crash" event, so this can't pass in CI
    // (ubuntu-latest is Ubuntu 24.04); it runs on macOS. Playwright skips its own test the same
    // way: tests/library/page-event-crash.spec.ts, "never dispatches the crash event".
    test.skip(
      process.platform === "linux",
      "Chromium on Linux (CI's Ubuntu 24.04) never dispatches Playwright's crash event; Playwright skips its own crash-event test there",
    );
    await openDashboard(crashableTab);

    await crashTab(crashableTab);

    expect(pageCrashes.join("\n")).toContain("tab crashed");
  });

  test("records a crash in a context the test opened and guarded", async ({ browser, guardContext, pageCrashes }) => {
    const friend = await guardedExtraPage(browser, guardContext);
    await openCrashingDashboard(friend);

    await expect(friend.getByText(PAGE_FALLBACK)).toBeVisible();
    await expect.poll(() => pageCrashes.join("\n")).toContain("caught by PageErrorBoundary: TypeError");
  });
});
