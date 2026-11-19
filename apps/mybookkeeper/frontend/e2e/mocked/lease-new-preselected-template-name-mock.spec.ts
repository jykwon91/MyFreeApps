/**
 * No-backend E2E: /leases/new?template_ids=<id> for a template that isn't in the first page of the
 * template list shows that template's name (fetched by id), not a short id. Runs under
 * playwright.layout.config.ts.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell, ORG_ID } from "./fixtures/mockSession";

const LATE_ID = "00000000-0000-0000-0000-0000000000e9";
const USER_ID = "00000000-0000-0000-0000-000000000001";

function summary(n: number) {
  return {
    id: `00000000-0000-0000-0000-00000000f0${String(n).padStart(2, "0")}`,
    user_id: USER_ID,
    organization_id: ORG_ID,
    name: `Template ${n}`,
    description: null,
    version: 1,
    file_count: 1,
    placeholder_count: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

test("a template preselected by the URL from past the first page shows its name", async ({ page }) => {
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await page.route(/\/api\/lease-templates(\?.*)?$/, (route) =>
    route.fulfill(json({ items: [summary(1), summary(2)], total: 3, has_more: true })),
  );
  await page.route(/\/api\/applicants\?/, (route) => route.fulfill(json({ items: [], total: 0, has_more: false })));
  await page.route(new RegExp(`/api/lease-templates/${LATE_ID}$`), (route) =>
    route.fulfill(
      json({ ...summary(3), id: LATE_ID, name: "Parking addendum", files: [], placeholders: [] }),
    ),
  );

  await page.goto(`/leases/new?template_ids=${LATE_ID}`);

  const chip = page.getByTestId(`lease-new-summary-template-${LATE_ID}`);
  await expect(chip).toContainText("Parking addendum");
  await expect(chip).not.toContainText(LATE_ID.slice(0, 8));
});
