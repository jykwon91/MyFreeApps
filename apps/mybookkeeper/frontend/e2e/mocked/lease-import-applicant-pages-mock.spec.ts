/**
 * No-backend E2E: the Import signed lease dialog can pick any applicant, not just the first page of them.
 * A host with more applicants than one page holds loads the next page with Load more, picks an applicant
 * from it, picks the house, and the lease is imported for that applicant and house. Runs under playwright.layout.config.ts.
 */
import type { Request } from "@playwright/test";
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { APPLICANT_DETAIL } from "./fixtures/mockApplicant";
import { DRAFT_LEASE, LEASE_ID } from "./fixtures/mockLease";
import { HOUSES, MAIN_HOUSE } from "./fixtures/mockProperty";

const PAGE_SIZE = 25;
const LATE_ID = "00000000-0000-0000-0000-0000000000e1";

function summary(id: string, name: string) {
  const { screening_results: _s, references: _r, video_call_notes: _v, events: _e, ...rest } = APPLICANT_DETAIL;
  return { ...rest, id, legal_name: name };
}

const FIRST_PAGE = Array.from({ length: PAGE_SIZE }, (_, i) =>
  summary(`00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`, `Applicant ${String(i + 1).padStart(2, "0")}`),
);
const LATE = summary(LATE_ID, "Zed Past The First Page");

test("a lease is imported for an applicant past the first page", async ({ page }) => {
  const offsets: number[] = [];
  const imports: string[] = [];
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "admin");
  await page.route(/\/api\/applicants(\?|$)/, (route) => {
    const offset = Number(new URL(route.request().url()).searchParams.get("offset") ?? "0");
    offsets.push(offset);
    if (offset === 0) return route.fulfill(json({ items: FIRST_PAGE, total: PAGE_SIZE + 1, has_more: true }));
    return route.fulfill(json({ items: [LATE], total: PAGE_SIZE + 1, has_more: false }));
  });
  await page.route(/\/api\/properties(\?|$)/, (route) => route.fulfill(json(HOUSES)));
  for (const list of [/\/api\/listings(\?|$)/, /\/api\/signed-leases(\?|$)/]) {
    await page.route(list, (route) => route.fulfill(json({ items: [], total: 0, has_more: false })));
  }
  await page.route(/\/api\/signed-leases\/import$/, (route, request: Request) => {
    imports.push(request.postData() ?? "");
    return route.fulfill(json({ ...DRAFT_LEASE, kind: "imported", status: "signed", applicant_id: LATE_ID }, 201));
  });
  await page.route(new RegExp(`/api/signed-leases/${LEASE_ID}$`), (route) => route.fulfill(json(DRAFT_LEASE)));

  await page.goto("/leases");
  await page.getByTestId("import-signed-lease-button").click();

  const select = page.getByTestId("import-applicant-select");
  await expect(select.locator("option", { hasText: "Applicant 25" })).toHaveCount(1);
  await expect(select.locator("option", { hasText: LATE.legal_name })).toHaveCount(0);

  // The dialog's listing dropdown pages too, so this is the Load more under the applicant dropdown.
  await page.locator("div.space-y-2", { has: select }).getByTestId("load-more-button").click();
  await expect(select.locator("option", { hasText: LATE.legal_name })).toHaveCount(1);
  await select.selectOption({ label: LATE.legal_name });
  expect(offsets).toEqual([0, PAGE_SIZE]);

  await page.getByTestId("import-file-input").setInputFiles({ name: "lease.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  // An applicant with no inquiry starts with no house, and the dialog won't import without one.
  await expect(page.getByTestId("import-submit")).toBeDisabled();
  await page.getByTestId("import-property-select").selectOption({ label: MAIN_HOUSE.name });
  await page.getByTestId("import-submit").click();

  await expect.poll(() => imports.length).toBe(1);
  expect(imports[0]).toContain(LATE_ID);
  expect(imports[0]).toContain(MAIN_HOUSE.id);
  await expect(page).toHaveURL(new RegExp(`/leases/${LEASE_ID}$`));
});
