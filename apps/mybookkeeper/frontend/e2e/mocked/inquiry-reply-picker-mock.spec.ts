/**
 * No-backend E2E for the inquiry reply panel's "Use template" tab when loading fails.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - A failed template list says so (never "no templates"), and Try again loads it.
 *   - A template that fails to fill in says so with Send off, and Try again fills it in,
 *     and focus moves to its Subject.
 *   - No templates links to the Reply Templates page, and following it closes the panel.
 *   - The failure state fits a phone, with a full-size Try again.
 */
import type { Page } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { INQUIRY_DETAIL, INQUIRY_ID } from "./fixtures/mockInquiry";
import { MIN_TOUCH_TARGET } from "@platform/ui/test-support/constants/minTouchTarget";

const TEMPLATE = {
  id: "00000000-0000-0000-0000-0000000000c1",
  organization_id: INQUIRY_DETAIL.organization_id,
  user_id: INQUIRY_DETAIL.user_id,
  name: "Initial inquiry reply",
  subject_template: "Re: $listing",
  body_template: "Hi $name,\n\nThanks for reaching out.",
  is_archived: false,
  display_order: 0,
  created_at: "2026-04-25T10:00:00Z",
  updated_at: "2026-04-25T10:00:00Z",
};

const RENDERED = { subject: "Re: Cozy Room", body: "Hi Alice,\n\nThanks for reaching out." };

interface Plan {
  /** Answers for each GET of the template list, in order; the last repeats. */
  lists: ("fail" | readonly unknown[])[];
  /** Answers for each render, in order; the last repeats. */
  renders: ("fail" | typeof RENDERED)[];
}

const fail = json({ detail: "boom" }, 500);

async function openReplyPanel(page: Page, plan: Plan): Promise<void> {
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await page.route(`**/api/inquiries/${INQUIRY_ID}`, (route) => route.fulfill(json(INQUIRY_DETAIL)));
  await page.route("**/api/integrations", (route) =>
    route.fulfill(json([{ provider: "gmail", connected: true, last_synced_at: null, metadata: null, has_send_scope: true }])),
  );
  let listCalls = 0;
  await page.route(/\/api\/reply-templates$/, (route) => {
    const answer = plan.lists[Math.min(listCalls++, plan.lists.length - 1)];
    return route.fulfill(answer === "fail" ? fail : json(answer));
  });
  let renderCalls = 0;
  await page.route(`**/api/inquiries/${INQUIRY_ID}/render-template/*`, (route) => {
    const answer = plan.renders[Math.min(renderCalls++, plan.renders.length - 1)];
    return route.fulfill(answer === "fail" ? fail : json(answer));
  });

  await page.goto(`/inquiries/${INQUIRY_ID}`);
  await page.getByRole("button", { name: "Reply with template", exact: true }).click();
  await expect(page.getByTestId("inquiry-reply-panel")).toBeVisible();
}

test.describe("Reply panel templates", () => {
  test("a failed list never reads as empty, and Try again loads it", async ({ page }) => {
    await openReplyPanel(page, { lists: ["fail", [TEMPLATE]], renders: [RENDERED] });
    const panel = page.getByTestId("inquiry-reply-panel");

    await expect(panel.getByRole("alert")).toHaveText("I couldn't load your templates. Want me to try again?");
    await expect(page.getByTestId("reply-template-picker-empty")).toHaveCount(0);

    await panel.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByTestId(`reply-template-card-${TEMPLATE.id}`)).toBeVisible();
    await expect(panel.getByRole("alert")).toHaveCount(0);
  });

  test("a template that fails to fill in says so, and Try again fills it in", async ({ page }) => {
    await openReplyPanel(page, { lists: [[TEMPLATE]], renders: ["fail", RENDERED] });
    const panel = page.getByTestId("inquiry-reply-panel");

    await page.getByTestId(`reply-template-card-${TEMPLATE.id}`).click();
    await expect(panel.getByRole("alert")).toHaveText("I couldn't fill in that template. Want me to try again?");
    await expect(page.getByTestId("reply-subject-input")).toHaveCount(0);
    await expect(page.getByTestId("reply-send-button")).toBeDisabled();

    await panel.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByTestId("reply-subject-input")).toHaveValue(RENDERED.subject);
    await expect(page.getByTestId("reply-send-button")).toBeEnabled();
    await expect(page.getByTestId("reply-subject-input")).toBeFocused();
  });

  test("no templates links to the Reply Templates page and closes the panel", async ({ page }) => {
    await openReplyPanel(page, { lists: [[]], renders: [RENDERED] });

    await expect(page.getByText("You don't have any templates yet.", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Create one on the Reply Templates page", exact: true }).click();
    await expect(page).toHaveURL(/\/reply-templates$/);
    await expect(page.getByTestId("inquiry-reply-panel")).toHaveCount(0);
  });

  test("the failure state fits a phone with a full-size Try again", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openReplyPanel(page, { lists: ["fail"], renders: [RENDERED] });

    const retry = page.getByTestId("inquiry-reply-panel").getByRole("button", { name: "Try again", exact: true });
    await expect(retry).toBeVisible();
    const box = await retry.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
