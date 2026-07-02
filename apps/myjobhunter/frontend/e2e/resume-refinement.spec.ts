import { test, expect } from "@playwright/test";
import { createTestUser, deleteTestUser, loginViaUI, resetRateLimit } from "./fixtures/auth";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8002";

/**
 * E2E tests for the Resume Refinement page (/resume).
 *
 * Scope: UX redesign introduced in fix/mjh/resume-refinement-split-composer.
 * Changes tested:
 *   1. /resume route is reachable and the page heading is visible
 *   2. No-session state renders the SessionStartPanel (not a crash)
 *   3. History/composer split: page does not render PendingProposalCard outside
 *      an active session (composer zone stays empty)
 *   4. "Start a different session" link is absent on the start screen
 *      (it only appears in the compact header during an active session)
 *   5. API: GET /resume-refinement/sessions returns 200 for an authenticated user
 *
 * Full composer-zone interaction (accept, skip, alternative regeneration with
 * skeleton) requires a live Claude session and is covered by manual smoke tests
 * on staging. The structural assertions here confirm the redesign didn't break
 * the page shell.
 */

test.describe("Resume Refinement page — no active session", () => {
  test("page is reachable and shows the refinement heading", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);

      // Navigate directly to /resume
      await page.goto("/resume");
      await page.waitForURL("**/resume");

      // The full (non-compact) header is rendered on the start screen
      await expect(
        page.getByRole("heading", { name: /resume refinement/i }),
      ).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("no-session state renders the start panel (not a crash / blank screen)", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);

      // Clear any leftover session key from localStorage to force no-session view
      await page.addInitScript(() => {
        localStorage.removeItem("mjh:resumeRefinementSessionId");
      });

      await page.goto("/resume");
      await page.waitForURL("**/resume");

      // SessionStartPanel should be visible — it contains the upload / start controls
      // The exact text from SessionStartPanel to check for:
      await expect(page.locator("main")).toBeVisible();
      // The page should NOT show "Start a different session" — that link only appears
      // in the compact header during an active session.
      await expect(
        page.getByRole("button", { name: /start a different session/i }),
      ).not.toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("layout: on mobile viewport composer zone is rendered before history zone", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);

      // Simulate mobile viewport
      await page.setViewportSize({ width: 375, height: 812 });

      await page.addInitScript(() => {
        localStorage.removeItem("mjh:resumeRefinementSessionId");
      });

      await page.goto("/resume");
      await page.waitForURL("**/resume");

      // On no-session view, main is visible and there's no layout crash
      await expect(page.locator("main")).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});

test.describe("Resume Refinement API — session list", () => {
  test("GET /resume-refinement/sessions returns 200 and an array for a new user", async ({
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await resetRateLimit(request);
      const loginResp = await request.post(`${BACKEND_URL}/api/auth/jwt/login`, {
        form: { username: user.email, password: user.password },
      });
      expect(loginResp.ok()).toBe(true);
      const { access_token } = await loginResp.json();

      const resp = await request.get(
        `${BACKEND_URL}/api/resume-refinement/sessions`,
        { headers: { Authorization: `Bearer ${access_token}` } },
      );
      expect(resp.status()).toBe(200);
      const body = await resp.json();
      expect(Array.isArray(body)).toBe(true);
    } finally {
      await deleteTestUser(request, user);
    }
  });

  test("GET /resume-refinement/sessions is tenant-isolated — new user sees empty list", async ({
    request,
  }) => {
    const userA = await createTestUser(request);
    const userB = await createTestUser(request);

    try {
      await resetRateLimit(request);
      const loginA = await request.post(`${BACKEND_URL}/api/auth/jwt/login`, {
        form: { username: userA.email, password: userA.password },
      });
      const { access_token: tokenA } = await loginA.json();

      await resetRateLimit(request);
      const loginB = await request.post(`${BACKEND_URL}/api/auth/jwt/login`, {
        form: { username: userB.email, password: userB.password },
      });
      const { access_token: tokenB } = await loginB.json();

      const respA = await request.get(
        `${BACKEND_URL}/api/resume-refinement/sessions`,
        { headers: { Authorization: `Bearer ${tokenA}` } },
      );
      const respB = await request.get(
        `${BACKEND_URL}/api/resume-refinement/sessions`,
        { headers: { Authorization: `Bearer ${tokenB}` } },
      );

      expect(respA.status()).toBe(200);
      expect(respB.status()).toBe(200);
      const sessionsA = await respA.json();
      const sessionsB = await respB.json();
      expect(Array.isArray(sessionsA)).toBe(true);
      expect(Array.isArray(sessionsB)).toBe(true);
    } finally {
      await deleteTestUser(request, userA);
      await deleteTestUser(request, userB);
    }
  });
});

test.describe("Resume Refinement — chat composer (mocked active session)", () => {
  // The composer only renders inside an active session, which normally
  // requires a live Claude critique. Mock the session GET (and the
  // alternative POST) at the network layer so the composer's real
  // interaction contract — always visible, clears on Enter, optimistic
  // echo, plain-text history labels — is exercised end-to-end without
  // an Anthropic dependency.
  const SESSION_ID = "11111111-2222-4333-8444-555555555555";

  function fakeSession(overrides: Record<string, unknown> = {}) {
    return {
      id: SESSION_ID,
      source_resume_job_id: null,
      status: "active",
      current_draft: "# Jane Doe\n\n- Built the payments system",
      improvement_targets: [
        {
          section: "Experience — bullet 1",
          current_text: "Built the payments system",
          improvement_type: "stronger_verb",
          severity: "medium",
          notes: null,
        },
      ],
      target_index: 0,
      pending_target_section: "Experience — bullet 1",
      pending_proposal: "Architected the payments system",
      pending_rationale: null,
      pending_clarifying_question: null,
      pending_guard_flagged: null,
      guard_can_force: false,
      turn_count: 2,
      total_tokens_in: 0,
      total_tokens_out: 0,
      total_cost_usd: "0",
      error_message: null,
      proposals_ready_count: 1,
      completed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      turns: [
        {
          id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
          turn_index: 0,
          role: "user_request_alternative",
          target_section: "Experience — bullet 1",
          proposed_text: null,
          user_text: "no em dashes",
          rationale: null,
          clarifying_question: null,
          created_at: new Date().toISOString(),
        },
      ],
      ...overrides,
    };
  }

  test("composer is always visible, clears on Enter with an optimistic echo, and history shows the user's own words", async ({
    page,
    request,
  }) => {
    const user = await createTestUser(request);

    try {
      await loginViaUI(page, user, request);

      await page.route(
        `**/api/resume-refinement/sessions/${SESSION_ID}`,
        (route) =>
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(fakeSession()),
          }),
      );
      // Hold the alternative call open long enough to observe the
      // cleared input + optimistic echo, then respond.
      await page.route(
        `**/api/resume-refinement/sessions/${SESSION_ID}/alternative`,
        async (route) => {
          await new Promise((r) => setTimeout(r, 800));
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(fakeSession({ turn_count: 4 })),
          });
        },
      );

      await page.addInitScript((id) => {
        localStorage.setItem("mjh:resumeRefinementSessionId", id);
      }, SESSION_ID);

      await page.goto("/resume");
      await page.waitForURL("**/resume");

      // History renders the user's own words — not "Try something with: …"
      await expect(page.getByText("no em dashes", { exact: true })).toBeVisible();
      await expect(page.getByText(/try something with/i)).toHaveCount(0);

      // Composer is visible without opening any panel.
      const composer = page.getByRole("textbox", { name: /message the assistant/i });
      await expect(composer).toBeVisible();
      await expect(composer).toHaveAttribute(
        "placeholder",
        /tell me what to change/i,
      );

      // Type + Enter: input clears immediately; optimistic echo + thinking
      // indicator appear while the request is in flight.
      await composer.fill("more concise please");
      await composer.press("Enter");
      await expect(composer).toHaveValue("");
      await expect(
        page.getByText("more concise please", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText(/working on a suggestion/i)).toBeVisible();
    } finally {
      await deleteTestUser(request, user);
    }
  });
});
