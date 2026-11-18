/**
 * No-backend E2E for the Lease Templates page paging: templates past the first page are reached
 * with Load more, and a failed Load more keeps the rows and offers Retry.
 *
 * Fully mocks the API via page.route(), so it runs under playwright.layout.config.ts.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell, ORG_ID } from "./fixtures/mockSession";

function template(n: number) {
  return {
    id: `00000000-0000-0000-0000-00000000e0${n}`,
    user_id: "00000000-0000-0000-0000-000000000001",
    organization_id: ORG_ID,
    name: `Template ${n}`,
    description: null,
    version: 1,
    file_count: 1,
    placeholder_count: 2,
    created_at: "2026-05-01T00:00:00Z",
    updated_at: "2026-05-01T00:00:00Z",
  };
}

test.describe("Lease Templates paging", () => {
  test("Load more reaches templates past the first page, and a failed one keeps the rows with Retry", async ({ page }) => {
    await plantAuth(page);
    await stubUnmatchedApi(page, { answer: "empty" });
    await stubWorkspaceShell(page, "owner");
    let secondPageCalls = 0;
    await page.route(/\/api\/lease-templates(\?.*)?$/, (route) => {
      const offset = Number(new URL(route.request().url()).searchParams.get("offset") ?? 0);
      if (offset === 0) return route.fulfill(json({ items: [template(1), template(2)], total: 3, has_more: true }));
      secondPageCalls += 1;
      if (secondPageCalls === 1) return route.fulfill(json({ detail: "boom" }, 500));
      return route.fulfill(json({ items: [template(3)], total: 3, has_more: false }));
    });

    await page.goto("/lease-templates");
    await expect(page.getByText("Template 2", { exact: true })).toBeVisible();
    await expect(page.getByText("Template 3", { exact: true })).toHaveCount(0);

    await page.getByTestId("load-more-button").click();
    await expect(page.getByText("I couldn't load more templates. Want me to try again?")).toBeVisible();
    await expect(page.getByText("Template 1", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(page.getByText("Template 3", { exact: true })).toBeVisible();
    await expect(page.getByTestId("load-more-button")).toHaveCount(0);
  });
});
