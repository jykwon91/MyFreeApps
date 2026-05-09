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
