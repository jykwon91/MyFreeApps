/**
 * No-backend E2E for the crash guard's main-landmark check
 * (@platform/ui/test-support/crashGuard): a page that closes, or leaves the
 * app's origin, while the teardown counts its landmarks is skipped, not
 * reported as "no main landmark" or "couldn't count".
 *
 * The pages are stubbed HTML on the app's origin. After the test body, each
 * keeps changing how many <main>s it has (never one, never steady), so the
 * count is still running when the page closes or navigates away.
 */
import type { BrowserContext } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";

const PROBE = "/__main-landmark-probe";
const ELSEWHERE = "https://accounts.example.test/sign-in";
/** How long the stubbed page churns its landmarks before it closes or leaves. */
const LEAVE_AFTER_MS = 1_000;

type Exit = "close" | "leave";

function html(body: string): { status: number; contentType: string; body: string } {
  return { status: 200, contentType: "text/html", body: `<!doctype html><html><body>${body}</body></html>` };
}

/** A page with no stable main: once started, it adds <main>s (0, 2, 3, …) until it exits. */
function churningPage(exit: Exit): string {
  const leave = exit === "close" ? "window.close()" : `location.href = ${JSON.stringify(ELSEWHERE)}`;
  return `<div id="mains"></div><script>
    window.startChurn = () => {
      let n = 1;
      setInterval(() => { n += 1; document.getElementById("mains").innerHTML = "<main></main>".repeat(n); }, 20);
      setTimeout(() => { ${leave}; }, ${LEAVE_AFTER_MS});
    };
  </script>`;
}

async function stubProbePages(context: BrowserContext): Promise<void> {
  await context.route(`**${PROBE}/opener`, (route) => route.fulfill(html("<main><h1>Opener</h1></main>")));
  await context.route(`**${PROBE}/close`, (route) => route.fulfill(html(churningPage("close"))));
  await context.route(`**${PROBE}/leave`, (route) => route.fulfill(html(churningPage("leave"))));
  await context.route(ELSEWHERE, (route) => route.fulfill(html("<h1>Another site</h1>")));
}

test.describe("main landmark check during teardown", () => {
  test("skips a popup that closes itself while it is being counted", async ({ page, context }) => {
    await stubProbePages(context);
    await page.goto(`${PROBE}/opener`);
    const opened = page.waitForEvent("popup");
    await page.evaluate((url) => window.open(url), `${PROBE}/close`);
    const popup = await opened;
    await popup.waitForLoadState();

    await popup.evaluate(() => Reflect.get(window, "startChurn")());
    await expect(page.getByRole("main")).toHaveCount(1);
  });

  test("skips a page that navigates to another origin while it is being counted", async ({ page, context }) => {
    await stubProbePages(context);
    await page.goto(`${PROBE}/leave`);

    await page.evaluate(() => Reflect.get(window, "startChurn")());
    await expect(page).toHaveURL(new RegExp(`${PROBE}/leave$`));
  });
});
