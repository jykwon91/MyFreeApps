/**
 * No-backend E2E for the Profile page while an upload waits to be read again:
 * the AI service was busy, so the job went back to the queue. The row says it
 * will be retried instead of looking stuck, and the note goes away once the
 * read succeeds.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";
import { RESUME_JOB_RETRY_NOTE } from "@myjobhunter/api-client/constants/resumeJobRetryNote";
import { mockProfile, mockResumeJob } from "./fixtures/mockData";

const EMPTY_LIST = { items: [], total: 0 };

test("a queued upload waiting to retry says so, and the note clears once it's read", async ({ page }) => {
  await stubSignedInShell(page, {
    routes: [
      { path: "/profile", body: mockProfile() },
      { path: "/education", body: EMPTY_LIST },
      { path: "/skills", body: EMPTY_LIST },
      { path: "/screening-answers", body: EMPTY_LIST },
      { path: "/work-history", body: EMPTY_LIST },
    ],
  });
  let parsed = false;
  await page.route("**/api/resume-upload-jobs", (route) =>
    route.fulfill(
      json([
        parsed
          ? mockResumeJob({ status: "complete", retry_count: 1 })
          : mockResumeJob({ status: "queued", retry_count: 1, error_message: "Claude is busy right now." }),
      ]),
    ),
  );

  await page.goto("/profile");
  await expect(page.getByText(RESUME_JOB_RETRY_NOTE)).toBeVisible();
  await expect(page.getByText("Claude is busy right now.")).toHaveCount(0);

  parsed = true;

  await expect(page.getByText(RESUME_JOB_RETRY_NOTE)).toHaveCount(0, { timeout: 15_000 });
});
