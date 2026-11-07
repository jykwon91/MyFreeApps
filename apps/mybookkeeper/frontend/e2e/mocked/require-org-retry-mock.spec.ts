/**
 * No-backend E2E for "Try again" when the signed-in user's organizations fail to load.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Every signed-in page waits on the organizations list. When it fails, the app
 * shows "Something went wrong loading your organizations." with Try again. RTK
 * clears ``isError`` the moment that retry starts while there is still no list,
 * which the gate used to read as "this user has no organizations" and so asked
 * an existing user to create one. While the retry runs, the error must stay up
 * with Try again showing it is busy, and the page must load once it succeeds.
 */
import { test, expect } from "@playwright/test";
import { json } from "./fixtures/mockResponse";
import { ORG_ID, plantAuth, stubSignedInShell } from "./fixtures/mockSession";
import { failUntilRecovered } from "./fixtures/flakyEndpoint";

const LOAD_ERROR = "Something went wrong loading your organizations.";
const ORGS = [{ id: ORG_ID, name: "Test Workspace", role: "admin", org_role: "admin" }];

test("a retry of a failed organizations load holds the error, then opens the page", async ({ page }) => {
  await plantAuth(page);
  await page.route("**/api/**", (route) => route.fulfill(json(route.request().method() === "GET" ? [] : {})));
  await stubSignedInShell(page, "admin");
  const orgs = await failUntilRecovered(page, /\/api\/organizations(\?|$)/, ORGS);

  await page.goto("/members");
  await expect(page.getByText(LOAD_ERROR)).toBeVisible();

  orgs.recover();
  const before = orgs.loads();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect.poll(orgs.loads).toBeGreaterThan(before);

  await expect(page.getByText(LOAD_ERROR)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retrying..." })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Create your organization" })).toHaveCount(0);

  orgs.release();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByText(LOAD_ERROR)).toHaveCount(0);
});

test("a failed refresh of loaded organizations holds its error through Try again", async ({ page }) => {
  await plantAuth(page);
  await page.route("**/api/**", (route) => route.fulfill(json(route.request().method() === "GET" ? [] : {})));
  await stubSignedInShell(page, "admin");
  let phase: "ok" | "failing" | "held" = "ok";
  let release!: () => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/organizations(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    if (phase === "failing") return route.fulfill(json({ detail: "Internal Server Error" }, 500));
    if (phase === "held") await released;
    return route.fulfill(json(ORGS));
  });

  await page.goto("/members");
  await expect(page.getByLabel("Email address")).toBeVisible();

  // Coming back to the tab refetches the organizations; that refresh fails.
  phase = "failing";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(LOAD_ERROR)).toBeVisible();

  phase = "held";
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retrying..." })).toBeDisabled();
  await expect(page.getByLabel("Email address")).toHaveCount(0);

  release();
  await expect(page.getByLabel("Email address")).toBeVisible();
  await expect(page.getByText(LOAD_ERROR)).toHaveCount(0);
});
