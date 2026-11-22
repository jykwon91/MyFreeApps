/**
 * No-backend E2E for the Profile page's resume "Download original": the new tab opens inside the
 * click (so Safari and Firefox don't block it) and lands on the signed link; a link that isn't
 * http(s) is refused with a message and no tab is left behind.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockProfile, mockResumeJob } from "./fixtures/mockData";

const EMPTY_LIST = { items: [], total: 0 };
const JOB = mockResumeJob({ status: "complete", file_filename: "resume.pdf" });
const FILE_URL = "https://files.example.test/resume.pdf";

async function openProfile(page: import("@playwright/test").Page, downloadUrl: string) {
  await stubSignedInShell(page, {
    routes: [
      { path: "/profile", body: mockProfile() },
      { path: "/work-history", body: EMPTY_LIST },
      { path: "/education", body: EMPTY_LIST },
      { path: "/skills", body: EMPTY_LIST },
      { path: "/screening-answers", body: EMPTY_LIST },
    ],
  });
  await page.route("**/api/resume-upload-jobs", (route) => route.fulfill(json([JOB])));
  await page.route(`**/api/resume-upload-jobs/${JOB.id}/download`, (route) =>
    route.fulfill(json({ url: downloadUrl })),
  );
  // The opened tab is a new page, so its requests are only stubbed from the context.
  await page.context().route(FILE_URL, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<title>resume file</title>" }),
  );
  await page.goto("/profile");
}

test("Download original opens the signed link in a new tab", async ({ page }) => {
  await openProfile(page, FILE_URL);

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Download resume.pdf" }).click();
  const popup = await popupPromise;

  await popup.waitForURL(FILE_URL);
  expect(await popup.evaluate(() => window.opener)).toBeNull();
});

test("Download original refuses a link that isn't a web address", async ({ page }) => {
  await openProfile(page, "javascript:alert(1)");

  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Download resume.pdf" }).click();
  const popup = await popupPromise;

  await expect(page.getByText("the download link wasn't a web address")).toBeVisible();
  await expect.poll(() => popup.isClosed()).toBe(true);
});
