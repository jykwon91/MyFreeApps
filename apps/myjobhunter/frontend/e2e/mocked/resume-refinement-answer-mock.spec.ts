/**
 * No-backend E2E for answering a suggestion on /resume: the next suggestion shows the moment an
 * answer lands, even when the reload after it fails, so a second Accept answers the suggestion on
 * screen; an answer to a suggestion that had already moved on says so and shows the current one; and
 * a lost reply says what the phone says: it may have gone through, and trying again is safe.
 */
import type { Route } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubSignedInShell } from "@platform/ui/test-support/mockSession";

const STORAGE_KEY = "mjh:resumeRefinementSessionId";
const JOBS_ENDPOINT = /\/api\/resume-upload-jobs(\?|$)/;
const SESSIONS_ENDPOINT = /\/api\/resume-refinement\/sessions(\/.*)?(\?|$)/;
const FIRST_REWRITE = "FIRST-REWRITE Led a team of five engineers";
const SECOND_REWRITE = "SECOND-REWRITE Shipped the app to 2M users";
const CHANGED = "That suggestion had already changed, so nothing was applied. The current one is showing now.";
const UNSURE = "I didn't get an answer, so I'm not sure that went through. Trying again is safe.";

function target(currentText: string) {
  return { section: "Experience", current_text: currentText, improvement_type: "add_metric", severity: "high", notes: null, origin: "ai" };
}

function session(targetIndex: number, turnCount: number, proposal: string) {
  return {
    id: "s1",
    source_resume_job_id: "job-1",
    status: "active",
    current_draft: "## Experience\n- Led the team\n- Shipped the app\n- Wrote docs",
    improvement_targets: [target("Led the team"), target("Shipped the app"), target("Wrote docs")],
    target_index: targetIndex,
    pending_target_section: "Experience",
    pending_proposal: proposal,
    pending_rationale: "Adds scope",
    pending_clarifying_question: null,
    pending_guard_flagged: null,
    guard_can_force: false,
    turn_count: turnCount,
    total_tokens_in: 0,
    total_tokens_out: 0,
    total_cost_usd: "0",
    error_message: null,
    proposals_ready_count: 3,
    completed_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    turns: [],
  };
}

const first = session(0, 2, FIRST_REWRITE);
const second = session(1, 4, SECOND_REWRITE);

test.beforeEach(async ({ page }) => {
  await stubSignedInShell(page);
  await page.addInitScript((key) => localStorage.setItem(key, "s1"), STORAGE_KEY);
  await page.route(JOBS_ENDPOINT, (route) => route.fulfill(json([])));
});

test("the next suggestion shows the moment an accept lands, though the reload fails", async ({ page }) => {
  const accepts: unknown[] = [];
  let offline = false;
  await page.route(SESSIONS_ENDPOINT, async (route: Route) => {
    const request = route.request();
    if (request.method() === "POST" && request.url().endsWith("/accept")) {
      accepts.push(request.postDataJSON());
      // The connection drops right after the first accept lands.
      offline = true;
      return route.fulfill(json(accepts.length === 1 ? second : session(2, 6, "THIRD-REWRITE")));
    }
    if (offline) return route.abort("internetdisconnected");
    return route.fulfill(json(first));
  });

  await page.goto("/resume");
  await expect(page.getByText(FIRST_REWRITE)).toBeVisible();

  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByText(SECOND_REWRITE)).toBeVisible();
  await expect(page.getByText(FIRST_REWRITE)).toHaveCount(0);

  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect.poll(() => accepts.length).toBe(2);
  expect(accepts).toEqual([
    { seen_target_index: 0, seen_turn_count: 2 },
    { seen_target_index: 1, seen_turn_count: 4 },
  ]);
});

test("an answer to a suggestion that had moved on says so and shows the current one", async ({ page }) => {
  let current = first;
  await page.route(SESSIONS_ENDPOINT, async (route: Route) => {
    const request = route.request();
    if (request.method() === "POST" && request.url().endsWith("/skip")) {
      // Another tab already answered this one.
      current = second;
      return route.fulfill(json({ detail: { code: "REFINEMENT_SUGGESTION_CHANGED", message: "server words" } }, 409));
    }
    return route.fulfill(json(current));
  });

  await page.goto("/resume");
  await expect(page.getByText(FIRST_REWRITE)).toBeVisible();

  await page.getByRole("button", { name: "Skip", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" }).getByText(CHANGED)).toBeVisible();
  await expect(page.getByText(SECOND_REWRITE)).toBeVisible();
});

test("a lost reply to an accept says it may have gone through, then shows what the server has", async ({ page }) => {
  let current = first;
  await page.route(SESSIONS_ENDPOINT, async (route: Route) => {
    const request = route.request();
    if (request.method() === "POST" && request.url().endsWith("/accept")) {
      // The accept reaches the server, but the reply is lost on the way back.
      current = second;
      return route.abort("connectionreset");
    }
    return route.fulfill(json(current));
  });

  await page.goto("/resume");
  await expect(page.getByText(FIRST_REWRITE)).toBeVisible();

  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(page.getByRole("region", { name: "Notifications" }).getByText(UNSURE)).toBeVisible();
  await expect(page.getByText(SECOND_REWRITE)).toBeVisible();
});
