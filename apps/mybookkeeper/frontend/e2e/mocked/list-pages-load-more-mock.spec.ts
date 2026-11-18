/**
 * No-backend E2E: "Load more" on a paged list page asks for one page at a time by offset, so it keeps
 * working past the server's limit cap (100 rows per request; a bigger limit is refused with a 422).
 * Before, each "Load more" asked again from the top with a growing limit, and the fifth was refused.
 * Also: a failed "Load more" keeps the rows with a Retry, and a stage filter starts again at its first
 * page. Runs under playwright.layout.config.ts.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { APPLICANT_DETAIL } from "./fixtures/mockApplicant";

const SERVER_LIMIT_CAP = 100;
const ROW_COUNT = SERVER_LIMIT_CAP + 30;
const PAGE_SIZE = 25;

function summary(n: number, stage: string) {
  const { screening_results: _s, references: _r, video_call_notes: _v, events: _e, ...rest } = APPLICANT_DETAIL;
  return { ...rest, id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`, legal_name: `Applicant ${n}`, stage };
}

const LEADS = Array.from({ length: ROW_COUNT }, (_, i) => summary(i + 1, "lead"));
const APPROVED = [summary(9001, "approved")];

test("applicants: Load more pages past the server's limit cap, survives a failed page, and a filter starts over", async ({ page }) => {
  const requests: URL[] = [];
  let failNextThirdPage = true;
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "owner");
  await page.route(/\/api\/applicants(\?|$)/, (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const limit = Number(url.searchParams.get("limit"));
    const offset = Number(url.searchParams.get("offset") ?? "0");
    if (!(limit >= 1 && limit <= SERVER_LIMIT_CAP)) return route.fulfill(json({ detail: "limit out of range" }, 422));
    if (offset === PAGE_SIZE * 2 && failNextThirdPage) {
      failNextThirdPage = false;
      return route.fulfill(json({ detail: "Internal Server Error" }, 500));
    }
    const rows = url.searchParams.get("stage") === "approved" ? APPROVED : LEADS;
    return route.fulfill(json({ items: rows.slice(offset, offset + limit), total: rows.length, has_more: offset + limit < rows.length }));
  });

  await page.goto("/applicants");
  const loadMore = page.getByRole("button", { name: "Load more" }).locator("visible=true").first();
  const row = (n: number) => page.getByText(`Applicant ${n}`, { exact: true }).locator("visible=true").first();
  await expect(row(1)).toBeVisible();

  await loadMore.click();
  await expect(row(PAGE_SIZE + 1)).toBeVisible();

  await loadMore.click();
  await expect(page.getByText("I couldn't load more applicants. Want me to try again?")).toBeVisible();
  await expect(row(1)).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(row(PAGE_SIZE * 2 + 1)).toBeVisible();
  await expect(page.getByText("I couldn't load more applicants. Want me to try again?")).toHaveCount(0);

  for (const last of [PAGE_SIZE * 4, PAGE_SIZE * 5, ROW_COUNT]) {
    await loadMore.click();
    await expect(row(last)).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  expect(requests.every((url) => Number(url.searchParams.get("limit")) <= SERVER_LIMIT_CAP)).toBe(true);

  await page.getByTestId("applicant-filter-approved").click();
  await expect(row(9001)).toBeVisible();
  await expect(page.getByText("Applicant 1", { exact: true })).toHaveCount(0);
  const approvedOffsets = requests.filter((url) => url.searchParams.get("stage") === "approved").map((url) => url.searchParams.get("offset"));
  expect(approvedOffsets).toEqual(["0"]);
});
