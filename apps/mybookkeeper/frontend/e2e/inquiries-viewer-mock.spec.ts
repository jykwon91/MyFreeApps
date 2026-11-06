/**
 * No-backend E2E for what a workspace viewer can do on /inquiries and an inquiry's page.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts
 * in the `frontend-layout-e2e` CI job.
 *
 * Verifies:
 *   - A viewer opens an inquiry from the list, is told it's view only, and gets none
 *     of the controls the server would refuse (New inquiry, stage, reply, promote,
 *     decline, archive, spam marks, notes editing). Notes read as text, and no
 *     write request leaves the page.
 *   - An owner still gets those controls, so the viewer check can't pass by accident.
 *   - The viewer's page has no horizontal overflow on a phone.
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import type { OrgRole } from "@mybookkeeper/api-client/types/organization/OrgRole";
import { json } from "./fixtures/mockResponse";
import { plantAuth, stubSignedInShell } from "./fixtures/mockSession";
import { INQUIRY_DETAIL, INQUIRY_ID, INQUIRY_NOTES, INQUIRY_SUMMARY } from "./fixtures/mockInquiry";

/** Answers the pages' reads and records every write, which a viewer must never send. */
async function stubApi(page: Page, orgRole: OrgRole): Promise<string[]> {
  const writes: string[] = [];
  // Registered first so the specific routes below win; the page's other reads get an empty answer.
  await page.route("**/api/**", (route, request: Request) => {
    if (request.method() !== "GET") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    return route.fulfill(json(request.method() === "GET" ? [] : {}));
  });
  await stubSignedInShell(page, orgRole);
  await page.route(/\/api\/listings(\?.*)?$/, (route) => route.fulfill(json({ items: [], total: 0, has_more: false })));
  await page.route(/\/api\/inquiries(\?.*)?$/, (route, request: Request) =>
    request.method() === "GET"
      ? route.fulfill(json({ items: [INQUIRY_SUMMARY], total: 1, has_more: false }))
      : route.fallback(),
  );
  await page.route(`**/api/inquiries/${INQUIRY_ID}`, (route, request: Request) =>
    request.method() === "GET" ? route.fulfill(json(INQUIRY_DETAIL)) : route.fallback(),
  );
  return writes;
}

async function openInquiryFromList(page: Page): Promise<void> {
  await page.goto("/inquiries");
  await page.getByText("Alice Nguyen").locator("visible=true").first().click();
  await expect(page.getByRole("heading", { name: "Alice Nguyen" })).toBeVisible();
}

test.describe("Inquiries for a viewer", () => {
  test("says it's view only and offers nothing the server would refuse", async ({ page }) => {
    await plantAuth(page);
    const writes = await stubApi(page, "viewer");

    await page.goto("/inquiries");
    await expect(page.getByText("Alice Nguyen").locator("visible=true").first()).toBeVisible();
    await expect(page.getByTestId("new-inquiry-button")).toHaveCount(0);
    await expect(page.getByTestId("manage-reply-templates-link")).toBeVisible();

    await openInquiryFromList(page);
    await expect(
      page.getByText("View only. Ask a workspace admin to reply to, promote, or change inquiries.", { exact: true }),
    ).toBeVisible();
    for (const name of ["Reply with template", "Promote to applicant", "Decline", "Archive", "Mark as spam", "Mark as not spam"]) {
      await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
    }
    await expect(page.getByTestId("inquiry-stage-dropdown")).toHaveCount(0);
    await expect(page.getByTestId("inquiry-action-row")).toHaveCount(0);
    await expect(page.getByRole("textbox")).toHaveCount(0);

    const notes = page.getByTestId("inquiry-notes-text");
    await expect(notes).toHaveText(INQUIRY_NOTES, { useInnerText: true });
    await expect(page.getByTestId("spam-triage-toggle")).toBeVisible();

    expect(writes).toEqual([]);
  });

  test("fits a phone screen without sideways scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await plantAuth(page);
    await stubApi(page, "viewer");
    await openInquiryFromList(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("Inquiries for an owner", () => {
  test("still offers the controls a viewer doesn't get", async ({ page }) => {
    await plantAuth(page);
    await stubApi(page, "owner");

    await page.goto("/inquiries");
    await expect(page.getByTestId("new-inquiry-button")).toBeVisible();

    await openInquiryFromList(page);
    await expect(page.getByTestId("inquiry-view-only")).toHaveCount(0);
    for (const name of ["Reply with template", "Promote to applicant", "Decline", "Archive", "Mark as spam", "Mark as not spam"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByTestId("inquiry-stage-dropdown")).toBeVisible();
    await expect(page.getByTestId("inquiry-notes-editor")).toHaveValue(INQUIRY_NOTES);
  });
});
