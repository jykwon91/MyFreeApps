/**
 * No-backend E2E for starting a refinement while an upload is still being read: the page says the
 * resume is being read (not "Upload a resume first"), and offers it to pick once it finishes,
 * without a reload.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";

const JOBS_ENDPOINT = /\/api\/resume-upload-jobs(\?|$)/;

function job(status: "processing" | "complete") {
  return {
    id: "job-1",
    profile_id: "p1",
    file_filename: "my-resume.pdf",
    file_content_type: "application/pdf",
    file_size_bytes: 1000,
    status,
    error_message: null,
    result_parsed_fields: null,
    parser_version: null,
    started_at: null,
    completed_at: status === "complete" ? "2026-01-01T00:00:00Z" : null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

test("an upload still being read shows as reading, then can be picked when it finishes", async ({ page }) => {
  await stubSignedInShell(page);
  let finished = false;
  await page.route(JOBS_ENDPOINT, (route) => route.fulfill(json([job(finished ? "complete" : "processing")])));

  await page.goto("/resume");

  await expect(page.getByText("Reading your resume")).toBeVisible();
  await expect(page.getByText("Upload a resume first")).toHaveCount(0);

  finished = true;

  await expect(page.getByText("my-resume.pdf")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Reading your resume")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start refinement" })).toBeVisible();
});
