/** One tax return, as the detail endpoint returns it, for no-backend specs. */
import type { Page } from "@playwright/test";
import { json } from "@platform/ui/test-support/mockResponse";
import { ORG_ID } from "./mockSession";

export const TAX_RETURN_ID = "00000000-0000-0000-0000-0000000000c1";

export const TAX_RETURN = {
  id: TAX_RETURN_ID,
  organization_id: ORG_ID,
  tax_year: 2025,
  filing_status: "single",
  jurisdiction: "federal",
  status: "draft",
  needs_recompute: false,
  filed_at: null,
  created_at: "2026-01-05T00:00:00Z",
  updated_at: "2026-01-05T00:00:00Z",
};

/** An empty source-documents answer; the catch-all's [] would crash the page's documents section. */
export async function stubTaxReturnSourceDocuments(page: Page): Promise<void> {
  await page.route(new RegExp(`/api/tax-returns/${TAX_RETURN_ID}/source-documents$`), (route) =>
    route.fulfill(json({ documents: [], checklist: [] })),
  );
}

/** The return and its source documents; the page's other reads fall to the spec's catch-all. */
export async function stubTaxReturnDetail(page: Page): Promise<void> {
  await page.route(new RegExp(`/api/tax-returns/${TAX_RETURN_ID}$`), (route) => route.fulfill(json(TAX_RETURN)));
  await stubTaxReturnSourceDocuments(page);
}
