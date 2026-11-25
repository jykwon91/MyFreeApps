/**
 * No-backend E2E: every lease records its house. The new-lease page needs a house and starts on the one
 * the applicant's inquiry listing is for; the lease page changes a lease's house and warns when a lease
 * has none. Runs under playwright.layout.config.ts.
 */
import type { Page, Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import type { SignedLeaseDetail } from "@mybookkeeper/api-client/types/lease/signed-lease-detail";
import { plantAuth, stubWorkspaceShell, ORG_ID } from "./fixtures/mockSession";
import { APPLICANT_DETAIL, APPLICANT_ID } from "./fixtures/mockApplicant";
import { INQUIRY_DETAIL, INQUIRY_ID } from "./fixtures/mockInquiry";
import { LISTING, LISTING_ID } from "./fixtures/mockListing";
import { DRAFT_LEASE, LEASE_ID } from "./fixtures/mockLease";
import { BACK_COTTAGE, HOUSES, MAIN_HOUSE } from "./fixtures/mockProperty";
import { LEASE_PROPERTY_MESSAGES } from "@/shared/lib/lease-property-messages";

const TEMPLATE_ID = "00000000-0000-0000-0000-0000000000d9";

async function signIn(page: Page): Promise<void> {
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await page.route(/\/api\/properties(\?|$)/, (route) => route.fulfill(json(HOUSES)));
}

/** The lease page for a lease that records `propertyId`; each PATCH answers with the house it sent. */
async function stubLeasePage(page: Page, propertyId: string | null, patches: unknown[]): Promise<void> {
  let lease: SignedLeaseDetail = { ...DRAFT_LEASE, property_id: propertyId };
  await page.route(new RegExp(`/api/applicants/${APPLICANT_ID}$`), (route) => route.fulfill(json(APPLICANT_DETAIL)));
  await page.route(new RegExp(`/api/signed-leases/${LEASE_ID}$`), (route, request: Request) => {
    if (request.method() === "PATCH") {
      const body = request.postDataJSON() as { property_id: string };
      patches.push(body);
      lease = { ...lease, property_id: body.property_id };
    }
    return route.fulfill(json(lease));
  });
}

test("a new lease needs a house and starts on the house the applicant inquired about", async ({ page }) => {
  const creates: unknown[] = [];
  await signIn(page);
  await page.route(/\/api\/lease-templates(\?.*)?$/, (route) => route.fulfill(json({ items: [], total: 0, has_more: false })));
  await page.route(new RegExp(`/api/lease-templates/${TEMPLATE_ID}$`), (route) =>
    route.fulfill(
      json({
        id: TEMPLATE_ID, user_id: "u1", organization_id: ORG_ID, name: "Room lease", description: null, version: 1,
        file_count: 1, placeholder_count: 0, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
        files: [], placeholders: [],
      }),
    ),
  );
  await page.route(/\/api\/lease-templates\/generate-defaults$/, (route) => route.fulfill(json({ placeholders: [] })));
  await page.route(new RegExp(`/api/applicants/${APPLICANT_ID}$`), (route) =>
    route.fulfill(json({ ...APPLICANT_DETAIL, inquiry_id: INQUIRY_ID })),
  );
  await page.route(new RegExp(`/api/inquiries/${INQUIRY_ID}$`), (route) => route.fulfill(json({ ...INQUIRY_DETAIL, listing_id: LISTING_ID })));
  await page.route(new RegExp(`/api/listings/${LISTING_ID}$`), (route) => route.fulfill(json(LISTING)));
  await page.route(/\/api\/signed-leases$/, (route, request: Request) => {
    creates.push(request.postDataJSON());
    return route.fulfill(json({ ...DRAFT_LEASE, property_id: BACK_COTTAGE.id }, 201));
  });
  await page.route(new RegExp(`/api/signed-leases/${LEASE_ID}$`), (route) => route.fulfill(json({ ...DRAFT_LEASE, property_id: BACK_COTTAGE.id })));

  await page.goto(`/leases/new?template_ids=${TEMPLATE_ID}&applicant_id=${APPLICANT_ID}`);

  const house = page.getByTestId("lease-generate-property");
  const submit = page.getByTestId("lease-generate-submit");
  await expect(house).toHaveValue(MAIN_HOUSE.id);
  await expect(page.getByTestId("lease-generate-property-hint")).toContainText("listing they inquired about");
  await expect(submit).toBeEnabled();

  await house.selectOption("");
  await expect(submit).toBeDisabled();

  await house.selectOption({ label: BACK_COTTAGE.name });
  await submit.click();

  await expect.poll(() => creates.length).toBe(1);
  expect(creates[0]).toMatchObject({ applicant_id: APPLICANT_ID, property_id: BACK_COTTAGE.id });
  await expect(page).toHaveURL(new RegExp(`/leases/${LEASE_ID}$`));
  await expect(page.getByTestId("lease-house-name")).toHaveText(BACK_COTTAGE.name);
});

test("the lease page moves a lease to another house", async ({ page }) => {
  const patches: unknown[] = [];
  await signIn(page);
  await stubLeasePage(page, MAIN_HOUSE.id, patches);

  await page.goto(`/leases/${LEASE_ID}`);

  await expect(page.getByTestId("lease-house-name")).toHaveText(MAIN_HOUSE.name);
  await expect(page.getByTestId("lease-house-missing-warning")).toHaveCount(0);
  const save = page.getByTestId("lease-house-save");
  await expect(save).toBeDisabled();

  await page.getByTestId("lease-house-select").selectOption({ label: BACK_COTTAGE.name });
  await save.click();

  await expect.poll(() => patches).toEqual([{ property_id: BACK_COTTAGE.id }]);
  await expect(page.getByTestId("lease-house-name")).toHaveText(BACK_COTTAGE.name);
  await expect(page.getByText(LEASE_PROPERTY_MESSAGES.saved, { exact: true })).toBeVisible();
});

test("a lease with no house warns that its rent isn't filed under one, and fixing it clears the warning", async ({ page }) => {
  const patches: unknown[] = [];
  await signIn(page);
  await stubLeasePage(page, null, patches);

  await page.goto(`/leases/${LEASE_ID}`);

  const warning = page.getByTestId("lease-house-missing-warning");
  await expect(warning).toContainText("won't be filed under one");
  await expect(page.getByTestId("lease-house-save")).toBeDisabled();

  await page.getByTestId("lease-house-select").selectOption({ label: MAIN_HOUSE.name });
  await page.getByTestId("lease-house-save").click();

  await expect.poll(() => patches).toEqual([{ property_id: MAIN_HOUSE.id }]);
  await expect(warning).toHaveCount(0);
  await expect(page.getByTestId("lease-house-name")).toHaveText(MAIN_HOUSE.name);
});
