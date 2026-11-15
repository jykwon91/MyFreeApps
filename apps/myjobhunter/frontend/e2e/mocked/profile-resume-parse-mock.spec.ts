/**
 * No-backend E2E for the Profile page after a resume upload: once the polled
 * upload list shows the parse finished, the work history the parser wrote
 * appears without a reload.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { mockProfile, mockResumeJob, mockWorkHistory } from "./fixtures/mockData";

const EMPTY_LIST = { items: [], total: 0 };

test("work history the parser wrote shows up once the upload list reports the parse complete", async ({ page }) => {
  await stubSignedInShell(page, {
    routes: [
      { path: "/profile", body: mockProfile() },
      { path: "/education", body: EMPTY_LIST },
      { path: "/skills", body: EMPTY_LIST },
      { path: "/screening-answers", body: EMPTY_LIST },
    ],
  });
  let parsed = false;
  await page.route("**/api/resume-upload-jobs", (route) =>
    route.fulfill(json([mockResumeJob({ status: parsed ? "complete" : "processing" })])),
  );
  let workHistoryReads = 0;
  await page.route("**/api/work-history", (route) => {
    workHistoryReads += 1;
    const items = parsed ? [mockWorkHistory({ company_name: "Globex", title: "Senior Engineer" })] : [];
    return route.fulfill(json({ items, total: items.length }));
  });

  await page.goto("/profile");
  await expect(page.getByText("No work history added yet")).toBeVisible();
  expect(workHistoryReads).toBe(1);

  parsed = true;

  await expect(page.getByText("Globex")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Senior Engineer")).toBeVisible();
  await expect(page.getByText("No work history added yet")).toHaveCount(0);
});
