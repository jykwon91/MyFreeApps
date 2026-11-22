/**
 * No-backend E2E for failed loads on Profile and /resume: a list that couldn't load says so
 * and retries (it never reads as "nothing added yet"), the resume picker never says "Upload a
 * resume first" because of a network failure, and a session that couldn't load can be retried
 * without throwing the saved session away.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockProfile, mockResumeJob, mockWorkHistory } from "./fixtures/mockData";

const EMPTY_LIST = { items: [], total: 0 };
const STORAGE_KEY = "mjh:resumeRefinementSessionId";
const SESSIONS_ENDPOINT = /\/api\/resume-refinement\/sessions(\/.*)?(\?|$)/;
const FAILURE = { status: 500, contentType: "application/json", body: JSON.stringify({ detail: "boom" }) };

test("a work history list that fails to load says so, then shows the entries on retry", async ({ page }) => {
  await stubSignedInShell(page, {
    routes: [
      { path: "/profile", body: mockProfile() },
      { path: "/education", body: EMPTY_LIST },
      { path: "/skills", body: EMPTY_LIST },
      { path: "/screening-answers", body: EMPTY_LIST },
    ],
  });
  await page.route("**/api/resume-upload-jobs", (route) => route.fulfill(json([])));
  let failing = true;
  await page.route("**/api/work-history", (route) =>
    failing ? route.fulfill(FAILURE) : route.fulfill(json({ items: [mockWorkHistory({ company_name: "Acme Corp" })], total: 1 })),
  );

  await page.goto("/profile");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Work history" }) });
  await expect(section.getByRole("alert")).toContainText("couldn't load your work history");
  await expect(page.getByText("No work history added yet")).toHaveCount(0);

  failing = false;
  await section.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Acme Corp")).toBeVisible();
});

test("a resume list that fails to load offers Try again instead of 'Upload a resume first'", async ({ page }) => {
  await stubSignedInShell(page);
  let failing = true;
  await page.route(/\/api\/resume-upload-jobs(\?|$)/, (route) =>
    failing ? route.fulfill(FAILURE) : route.fulfill(json([mockResumeJob({ status: "complete" })])),
  );

  await page.goto("/resume");
  await expect(page.getByText("We couldn't load your resumes")).toBeVisible();
  await expect(page.getByText("Upload a resume first")).toHaveCount(0);

  failing = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Start refinement" })).toBeVisible();
});

test("a saved session that fails to load offers Try again and keeps the saved session", async ({ page }) => {
  await stubSignedInShell(page);
  await page.addInitScript((key) => localStorage.setItem(key, "saved-session"), STORAGE_KEY);
  await page.route(SESSIONS_ENDPOINT, (route) => route.fulfill(FAILURE));

  await page.goto("/resume");
  await expect(page.getByText(/We couldn't load that session/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start a new one" })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe("saved-session");
});

test("a saved session that no longer exists offers only a new one", async ({ page }) => {
  await stubSignedInShell(page);
  await page.addInitScript((key) => localStorage.setItem(key, "gone-session"), STORAGE_KEY);
  await page.route(/\/api\/resume-upload-jobs(\?|$)/, (route) => route.fulfill(json([])));
  await page.route(SESSIONS_ENDPOINT, (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ detail: "Not found" }) }),
  );

  await page.goto("/resume");
  await expect(page.getByText(/no longer exists/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start a new one" })).toBeVisible();
});
