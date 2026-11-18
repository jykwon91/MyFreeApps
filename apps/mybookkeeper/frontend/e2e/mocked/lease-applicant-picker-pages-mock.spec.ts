/**
 * No-backend E2E: the lease applicant picker on /leases/new pages through the
 * approved and lease_sent stages. Someone past the first page can be found and
 * picked, and a failed "Load more" keeps the list with a Retry. Runs under
 * playwright.layout.config.ts.
 */
import { test, expect } from "@platform/ui/test-support/crashGuard";
import { json } from "@platform/ui/test-support/mockResponse";
import { stubUnmatchedApi } from "@platform/ui/test-support/mockSession";
import { plantAuth, stubWorkspaceShell } from "./fixtures/mockSession";
import { APPLICANT_DETAIL } from "./fixtures/mockApplicant";

const PAGE_SIZE = 25;
const TEMPLATE_ID = "00000000-0000-0000-0000-0000000000d1";
const LATE_ID = "00000000-0000-0000-0000-0000000000e1";

const TEMPLATES = {
  items: [
    {
      id: TEMPLATE_ID,
      user_id: APPLICANT_DETAIL.user_id,
      organization_id: APPLICANT_DETAIL.organization_id,
      name: "Standard Lease",
      description: null,
      version: 1,
      file_count: 1,
      placeholder_count: 1,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    },
  ],
  total: 1,
  has_more: false,
};

function summary(id: string, name: string, stage: string) {
  const { screening_results: _s, references: _r, video_call_notes: _v, events: _e, ...rest } = APPLICANT_DETAIL;
  return { ...rest, id, legal_name: name, stage };
}

const FIRST_PAGE = Array.from({ length: PAGE_SIZE }, (_, i) =>
  summary(`00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`, `Applicant ${String(i + 1).padStart(2, "0")}`, "approved"),
);
const LATE = summary(LATE_ID, "Zed Past The First Page", "approved");

test("an applicant past the first page can be loaded and picked; a failed Load more retries", async ({ page }) => {
  const requests: URL[] = [];
  let failNextSecondPage = true;
  await plantAuth(page);
  await stubUnmatchedApi(page, { answer: "empty" });
  await stubWorkspaceShell(page, "admin");
  await page.route(/\/api\/lease-templates(\?|$)/, (route) => route.fulfill(json(TEMPLATES)));
  await page.route(new RegExp(`/api/applicants/${LATE_ID}$`), (route) => route.fulfill(json({ ...APPLICANT_DETAIL, id: LATE_ID, legal_name: LATE.legal_name })));
  await page.route(/\/api\/applicants\?/, (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const stage = url.searchParams.get("stage");
    const offset = Number(url.searchParams.get("offset") ?? "0");
    if (stage === "approved" && offset === 0) return route.fulfill(json({ items: FIRST_PAGE, total: PAGE_SIZE + 1, has_more: true }));
    if (stage === "approved" && failNextSecondPage) {
      failNextSecondPage = false;
      return route.fulfill(json({ detail: "Internal Server Error" }, 500));
    }
    if (stage === "approved") return route.fulfill(json({ items: [LATE], total: PAGE_SIZE + 1, has_more: false }));
    return route.fulfill(json({ items: [], total: 0, has_more: false }));
  });

  await page.goto(`/leases/new?template_ids=${TEMPLATE_ID}`);
  await expect(page.getByTestId("applicant-option-" + FIRST_PAGE[0].id)).toBeVisible();
  await expect(page.getByTestId("applicant-option-" + LATE_ID)).toHaveCount(0);
  expect(requests.map((url) => url.searchParams.get("stage")).sort()).toEqual(["approved", "lease_sent"]);

  await page.getByTestId("applicant-picker-load-more").click();
  await expect(page.getByText(/couldn't load more applicants/i)).toBeVisible();
  await expect(page.getByTestId("applicant-option-" + FIRST_PAGE[0].id)).toBeVisible();

  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByTestId("applicant-option-" + LATE_ID)).toBeVisible();
  await expect(page.getByTestId("applicant-picker-load-more")).toHaveCount(0);

  await page.getByTestId("applicant-option-" + LATE_ID).click();
  await expect(page).toHaveURL(new RegExp(`applicant_id=${LATE_ID}`));
});
