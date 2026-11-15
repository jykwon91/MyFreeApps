/**
 * No-backend E2E for "Start new" on /resume: while the new session loads, the previous session's
 * draft is never on screen (and so none of its live buttons).
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";

const STORAGE_KEY = "mjh:resumeRefinementSessionId";
const JOBS_ENDPOINT = /\/api\/resume-upload-jobs(\?|$)/;
const SESSIONS_ENDPOINT = /\/api\/resume-refinement\/sessions(\/.*)?(\?|$)/;
const OLD_DRAFT = "OLD-SESSION-DRAFT-LINE";
const NEW_DRAFT = "NEW-SESSION-DRAFT-LINE";

function session(id: string, draft: string) {
  return {
    id,
    source_resume_job_id: "job-1",
    status: "active",
    current_draft: draft,
    improvement_targets: [],
    target_index: 0,
    pending_target_section: null,
    pending_proposal: null,
    pending_rationale: null,
    pending_clarifying_question: null,
    pending_guard_flagged: null,
    guard_can_force: false,
    turn_count: 0,
    total_tokens_in: 0,
    total_tokens_out: 0,
    total_cost_usd: "0",
    error_message: null,
    proposals_ready_count: 0,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    turns: [],
  };
}

const job = {
  id: "job-1",
  profile_id: "p1",
  file_filename: "my-resume.pdf",
  file_content_type: "application/pdf",
  file_size_bytes: 1000,
  status: "complete",
  error_message: null,
  result_parsed_fields: null,
  parser_version: null,
  started_at: null,
  completed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

test("starting a new session never shows the previous one", async ({ page }) => {
  await stubSignedInShell(page);
  await page.addInitScript((key) => localStorage.setItem(key, "old-session"), STORAGE_KEY);
  await page.route(JOBS_ENDPOINT, (route) => route.fulfill(json([job])));
  // The new session's own GET is slow, so the in-between state is observable.
  await page.route(SESSIONS_ENDPOINT, async (route) => {
    const request = route.request();
    if (request.method() === "POST") return route.fulfill(json(session("new-session", NEW_DRAFT)));
    if (request.url().includes("/new-session")) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return route.fulfill(json(session("new-session", NEW_DRAFT)));
    }
    return route.fulfill(json(session("old-session", OLD_DRAFT)));
  });

  await page.goto("/resume");
  await expect(page.getByText(OLD_DRAFT)).toBeVisible();

  await page.getByRole("button", { name: /start a different session/i }).click();
  await page.getByText("my-resume.pdf").click();
  await page.getByRole("button", { name: "Start refinement" }).click();

  await expect(page.getByText(NEW_DRAFT)).toBeVisible();
  await expect(page.getByText(OLD_DRAFT)).toHaveCount(0);
});
