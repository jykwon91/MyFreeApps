/**
 * No-backend E2E: "Load more" on the Welcome Manuals page asks for one page at a time by offset, so it
 * keeps working past the server's limit cap (100 rows per request; a bigger limit is refused with a 422).
 * Before, each "Load more" asked again from the top with a growing limit, and the fifth was refused.
 * Runs under playwright.layout.config.ts.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";

const SERVER_LIMIT_CAP = 100;
const ROW_COUNT = SERVER_LIMIT_CAP + 30;
const PAGE_SIZE = 25;

function summary(n: number) {
  return {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    title: `Guide ${n}`,
    property_id: null,
    section_count: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

const MANUALS = Array.from({ length: ROW_COUNT }, (_, i) => summary(i + 1));

test("welcome manuals: Load more pages past the server's limit cap, one page at a time", async ({ page }) => {
  const offsets: number[] = [];
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await page.route("**/api/properties", (route) => route.fulfill(json([])));
  await page.route(/\/api\/welcome-manuals(\?|$)/, (route) => {
    const url = new URL(route.request().url());
    const limit = Number(url.searchParams.get("limit"));
    const offset = Number(url.searchParams.get("offset") ?? "0");
    if (!(limit >= 1 && limit <= SERVER_LIMIT_CAP)) return route.fulfill(json({ detail: "limit out of range" }, 422));
    offsets.push(offset);
    return route.fulfill(json({ items: MANUALS.slice(offset, offset + limit), total: ROW_COUNT, has_more: offset + limit < ROW_COUNT }));
  });

  await page.goto("/welcome-manuals");
  const row = (n: number) => page.getByText(`Guide ${n}`, { exact: true }).locator("visible=true").first();
  await expect(row(1)).toBeVisible();

  for (let shown = PAGE_SIZE; shown < ROW_COUNT; shown += PAGE_SIZE) {
    await page.getByTestId("load-more-button").click();
    await expect(row(Math.min(shown + PAGE_SIZE, ROW_COUNT))).toBeVisible();
  }

  await expect(page.getByTestId("load-more-button")).toHaveCount(0);
  await expect(page.getByText(/couldn't load/i)).toHaveCount(0);
  expect(offsets).toEqual([0, 25, 50, 75, 100, 125]);
});
